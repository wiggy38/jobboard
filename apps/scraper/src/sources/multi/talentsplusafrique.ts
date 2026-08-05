import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../lib/scraper-base'
import { info, warn } from '../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../lib/content-filter'
import { prioritizeUnseen } from '../../lib/pagination'

// Cabinet de recrutement régional (Bénin, Togo, Mali, Côte d'Ivoire) — listing
// statique paginé ?page=N sous /jobs, chaque fiche détail (/job-details/:id)
// expose un badge vert "ae-badge-green" avec le nom du pays en clair, plus
// fiable que de parser la ville/lieu — d'où COUNTRY_BADGE_TO_ISO plutôt qu'une
// déduction depuis city. Une offre dont le pays ne correspond à aucun pays
// suivi par Tumaa est rejetée (jamais insérée sans country certain — voir
// convention multi-pays CLAUDE.md).
const SITE_URL = 'https://www.talentsplusafrique.com/jobs'
const MAX_PAGES = 3
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'bénin': 'BJ',
  'benin': 'BJ',
  'togo': 'TG',
  'mali': 'ML',
  "côte d'ivoire": 'CI',
  "cote d'ivoire": 'CI',
  'sénégal': 'SN',
  'senegal': 'SN',
  'cameroun': 'CM',
  'niger': 'NE',
  'tchad': 'TD',
}

function countryFromText(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const normalized = raw.trim().toLowerCase()
  for (const [name, iso] of Object.entries(COUNTRY_NAME_TO_ISO)) {
    if (normalized.includes(name)) return iso
  }
  return undefined
}

interface ListingItem {
  title: string
  sourceUrl: string
  organization?: string
  city?: string
  deadline?: Date
  country?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchListingPage(page: number): Promise<ListingItem[]> {
  const pageUrl = page === 1 ? SITE_URL : `${SITE_URL}?page=${page}`
  const response = await axios.get<string>(pageUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data)

  const items: ListingItem[] = []
  $('.job-wrap').each((_i, el) => {
    const $card = $(el)
    const $link = $card.find('h3.job-title a').first()
    const title = extractText($link)
    const sourceUrl = $link.attr('href') ?? ''
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    const organization = extractText($card.find('.job-company').first()) || undefined
    const locationTag = extractText($card.find('.job-tag').first())
    const deadlineText = extractText($card.find('.job-deadline .badge').first())

    items.push({
      title,
      sourceUrl,
      organization,
      city: locationTag || undefined,
      deadline: parseFlexibleDateText(deadlineText),
      country: countryFromText(locationTag),
    })
  })

  return items
}

export class TalentsPlusAfriqueScraper extends BaseScraper {
  readonly name = 'talentsplusafrique'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'

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
      errors.push('Aucune offre exploitable détectée — structure HTML probablement modifiée')
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
        const pageText = extractText(d$('.ae-wrap')) || item.title
        // Le badge vert de la fiche détail est plus fiable que la carte de
        // liste (parfois un lieu précis sans nom de pays explicite).
        const badgeCountry = countryFromText(extractText(d$('.ae-badge-green').first()))
        const country = badgeCountry ?? item.country

        if (!country) {
          warn(this.name, `Rejeté (pays inconnu) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

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
            city:           extracted.city          ?? item.city ?? 'Non précisé',
            country,
            sector:         extracted.sector,
            level:          extracted.level,
            contractType:   extracted.contractType,
            description:    extracted.description,
            requirements:   extracted.requirements,
            contactEmail:   extracted.contactEmail,
            contactPhone:   extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline:       parseFlexibleDateText(extracted.deadline) ?? item.deadline,
            publishedAt:    parseFlexibleDateText(extracted.publishedAt),
            sourceUrl:      item.sourceUrl,
            isSponsored:    extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          }

          offers.push(offer)
          info(this.name, `Scraped: "${offer.title.slice(0, 60)}" (${country})`)
        }
      } catch (err) {
        const msg = `Failed on ${item.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    // Offres restantes au-delà du budget Haiku — données de liste uniquement,
    // seulement si le pays a pu être déduit depuis la carte de liste.
    for (const item of ordered.slice(DETAIL_LIMIT)) {
      if (!item.country) continue
      offers.push({
        title:        item.title,
        organization: item.organization ?? 'Non précisé',
        city:         item.city ?? 'Non précisé',
        country:      item.country,
        deadline:     item.deadline,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default TalentsPlusAfriqueScraper
