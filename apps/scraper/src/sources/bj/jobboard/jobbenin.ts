import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing statique paginé (?page=N) rendu côté serveur — le formulaire de
// recherche (#recherche-form) recharge la même page en AJAX mais le HTML
// initial est déjà exploitable sans JS. Cartes de liste en ".job-bx.style-1"
// (template Jobzilla), titre+lien dans ".job-contant h4 a". Au moment de
// l'écriture, le site n'affichait aucune offre active (catalogue vide) — les
// sélecteurs suivent la convention CSS observée dans le head de la page
// (.job-bx .job-contant h4 a / .job-contant p) plutôt qu'une fiche réelle ;
// à revérifier dès que le site publie ses premières offres.
const BASE_URL = 'https://jobbenin.com'
const SITE_URL = `${BASE_URL}/offres`
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
  excerpt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveUrl(href: string): string {
  return href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`
}

async function fetchListingPage(page: number): Promise<ListingItem[]> {
  const pageUrl = page === 1 ? SITE_URL : `${SITE_URL}?page=${page}`
  const response = await axios.get<string>(pageUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data)

  const items: ListingItem[] = []
  $('.job-bx').each((_i, el) => {
    const $card = $(el)
    const $link = $card.find('.job-contant h4 a').first()
    const title = extractText($link)
    const href = $link.attr('href') ?? ''
    if (!title || !href) return
    const sourceUrl = resolveUrl(href)
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    items.push({
      title,
      sourceUrl,
      excerpt: extractText($card.find('.job-contant p').first()),
    })
  })

  return items
}

export class JobBeninScraper extends BaseScraper {
  readonly name = 'jobbenin'
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
        const pageText = extractText(d$('main')).replace(/\s{3,}/g, '\n') || item.excerpt

        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? 'Non précisé',
            city:           extracted.city          ?? 'Bénin',
            country:        this.country,
            sector:         extracted.sector,
            level:          extracted.level,
            contractType:   extracted.contractType,
            description:    extracted.description   ?? item.excerpt,
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
        organization: 'Non précisé',
        city:         'Bénin',
        country:      this.country,
        description:  item.excerpt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default JobBeninScraper
