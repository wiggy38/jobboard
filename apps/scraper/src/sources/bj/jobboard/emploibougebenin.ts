import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing statique (Laravel, pas de pagination observée — une seule page
// affiche toutes les offres). Les offres expirées restent affichées comme
// contenu grisé ("filler" SEO) mais sont rendues en <div> inerte (pas de
// href, badge "Expirée"), alors qu'une offre active est un <a class="ol-card"
// href="/offres/{id}/{slug}">. Le sélecteur `a.ol-card[href]` exclut donc
// naturellement les offres expirées sans avoir à parser le badge.
const BASE_URL = 'https://emploibougebenin.com'
const SITE_URL = `${BASE_URL}/offres`
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
  organization?: string
  city?: string
  contractType?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function fetchListing(): Promise<string> {
  return axios.get<string>(SITE_URL, { headers: HTTP_HEADERS, timeout: 15_000 }).then(r => r.data)
}

function parseListing(html: string): ListingItem[] {
  const $ = cheerio.load(html)
  const items: ListingItem[] = []

  $('a.ol-card[href]').each((_i, el) => {
    const $card = $(el)
    const href = $card.attr('href') ?? ''
    const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`
    const title = extractText($card.find('.ol-card__title').first())
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    items.push({
      title,
      sourceUrl,
      excerpt: extractText($card.find('.ol-card__desc').first()),
      organization: extractText($card.find('.ol-card__company').first()) || undefined,
      city: extractText($card.find('.ol-badge--loc').first()) || undefined,
      contractType: extractText($card.find('.ol-badge--type').first()) || undefined,
    })
  })

  return items
}

export class EmploiBougeBeninScraper extends BaseScraper {
  readonly name = 'emploibougebenin'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    info(this.name, `Fetching listing: ${SITE_URL}`)

    let listings: ListingItem[]
    try {
      listings = parseListing(await fetchListing())
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      warn(this.name, msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    if (listings.length === 0) {
      errors.push('Aucune offre active trouvée (toutes expirées ou structure HTML modifiée)')
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
          offers.push({
            title: extracted.title ?? item.title,
            organization: extracted.organization ?? item.organization ?? 'Non précisé',
            city: extracted.city ?? item.city ?? 'Bénin',
            country: this.country,
            sector: extracted.sector,
            level: extracted.level,
            contractType: extracted.contractType ?? item.contractType,
            description: extracted.description ?? item.excerpt,
            requirements: extracted.requirements,
            contactEmail: extracted.contactEmail,
            contactPhone: extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline: parseFlexibleDateText(extracted.deadline),
            publishedAt: parseFlexibleDateText(extracted.publishedAt),
            sourceUrl: item.sourceUrl,
            isSponsored: extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          })

          info(this.name, `Scraped: "${item.title.slice(0, 60)}"`)
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
        title: item.title,
        organization: item.organization ?? 'Non précisé',
        city: item.city ?? 'Bénin',
        country: this.country,
        contractType: item.contractType,
        description: item.excerpt,
        sourceUrl: item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default EmploiBougeBeninScraper
