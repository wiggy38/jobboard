import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing statique paginé (?page=N, ~279 offres/14 pages au moment de
// l'écriture), pas d'API ni de flux RSS. Cartes en "a.block[href*='/emplois/']" :
// titre dans "h3", organisation dans "p.text-primary-600 span", puis un
// premier "span" (lieu, à côté d'une icône SVG) et un second "span" (type de
// contrat) dans le bloc "text-gray-500" — ordre fixe observé sur le site.
const BASE_URL = 'https://africarrieres.com'
const SITE_URL = `${BASE_URL}/benin/fr/emplois`
const MAX_PAGES = 3
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

interface ListingItem {
  title: string
  sourceUrl: string
  organization?: string
  city?: string
  contractType?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapContractType(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower.includes('cdi') || lower.includes('indéterminée')) return 'CDI'
  if (lower.includes('cdd') || lower.includes('déterminée')) return 'CDD'
  if (lower.includes('stage')) return 'STAGE'
  if (lower.includes('alternance')) return 'ALTERNANCE'
  if (lower.includes('freelance') || lower.includes('consultant')) return 'FREELANCE'
  if (lower.includes('bénévol')) return 'BENEVOLE'
  return undefined
}

async function fetchListingPage(page: number): Promise<ListingItem[]> {
  const pageUrl = page === 1 ? SITE_URL : `${SITE_URL}?page=${page}`
  const response = await axios.get<string>(pageUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data)

  const items: ListingItem[] = []
  $('a.block[href*="/emplois/"]').each((_i, el) => {
    const $card = $(el)
    const title = extractText($card.find('h3').first())
    const sourceUrl = $card.attr('href') ?? ''
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    const organization = extractText($card.find('p.text-primary-600 span').first()) || undefined
    const infoSpans = $card.find('div.text-gray-500 span')
    const city = extractText(infoSpans.eq(0)) || undefined
    const contractType = mapContractType(extractText(infoSpans.eq(1)))

    items.push({ title, sourceUrl, organization, city, contractType })
  })

  return items
}

export class AfricarrieresScraper extends BaseScraper {
  readonly name = 'africarrieres'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const listings: ListingItem[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      info(this.name, `Fetching listing page ${page}/${MAX_PAGES}`)
      try {
        const items = await fetchListingPage(page)
        if (items.length === 0) break
        listings.push(...items)
      } catch (err) {
        const msg = `Listing fetch failed (page ${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      if (page < MAX_PAGES) await sleep(POLITE_DELAY_MS)
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable détectée — catalogue vide ou structure HTML modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResponse = await axios.get<string>(item.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const d$ = cheerio.load(detailResponse.data)
        d$('script, style, nav, header, footer').remove()
        const pageText = extractText(d$('main#main-content'))

        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? item.organization ?? 'Non précisé',
            city:           extracted.city          ?? item.city ?? 'Bénin',
            country:        this.country,
            sector:         extracted.sector,
            level:          extracted.level,
            contractType:   extracted.contractType   ?? item.contractType,
            description:    extracted.description,
            requirements:   extracted.requirements,
            contactEmail:   extracted.contactEmail,
            contactPhone:   extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline:       parseFlexibleDateText(extracted.deadline),
            publishedAt:    parseFlexibleDateText(extracted.publishedAt),
            sourceUrl:      item.sourceUrl,
            isSponsored:    extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          }

          offers.push(offer)
          info(this.name, `Scraped: "${offer.title.slice(0, 60)}"`)
        }
      } catch (err) {
        const msg = `Failed on ${item.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    // Offres restantes au-delà du budget Haiku — données de liste uniquement
    for (const item of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title:        item.title,
        organization: item.organization ?? 'Non précisé',
        city:         item.city ?? 'Bénin',
        country:      this.country,
        contractType: item.contractType,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default AfricarrieresScraper
