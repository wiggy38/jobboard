import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Portail officiel du gouvernement béninois : page listing statique (pas de
// Cloudflare/JS requis, contrairement à emploibenin.com/optioncarriere.bj),
// paginée 60 offres/page sous /opportunites/offres-emploi/[N]/. Chaque fiche
// détail (/opportunite/:id/:slug/) expose le texte complet dans
// article.article — souvent des annonces "multipostes" (plusieurs postes
// distincts dans une même fiche), d'où extractOffersWithHaiku plutôt que
// extractWithHaiku.
const SITE_URL = 'https://www.gouv.bj/opportunites/offres-emploi/'
const MAX_PAGES = 3
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

const FRENCH_MONTHS_ABBR: Record<string, number> = {
  jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5,
  juil: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11,
}

interface ListingItem {
  title: string
  sourceUrl: string
  excerpt: string
  deadline?: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Format observé sur les cartes de liste : "18 Oct 2024 à 15:46" (mois
// abrégé français) — parseFlexibleDateText (ai-extractor.ts) ne connaît que
// les noms de mois complets, d'où ce parseur dédié en fallback.
function parseListingDeadline(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const match = raw.trim().match(/(\d{1,2})\s+(\w+)\.?\s+(\d{4})/)
  if (!match) return undefined
  const monthKey = match[2].toLowerCase().slice(0, 3)
  const month = FRENCH_MONTHS_ABBR[monthKey]
  if (month === undefined) return undefined
  const d = new Date(parseInt(match[3], 10), month, parseInt(match[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

async function fetchListingPage(page: number): Promise<ListingItem[]> {
  const pageUrl = page === 1 ? SITE_URL : `${SITE_URL}${page}/`
  const response = await axios.get<string>(pageUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data)

  const items: ListingItem[] = []
  $('article').each((_i, el) => {
    const $card = $(el)
    const $link = $card.find('h3 a[href*="/opportunite/"]').first()
    const title = extractText($link)
    const sourceUrl = $link.attr('href') ?? ''
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    const excerpt = extractText($card.find('p').first())
    const deadlineText = extractText($card.find('span.error'))

    items.push({ title, sourceUrl, excerpt, deadline: parseListingDeadline(deadlineText) })
  })

  return items
}

export class GouvBjScraper extends BaseScraper {
  readonly name = 'gouvbj'
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
        const pageText = extractText(d$('article.article')) || item.excerpt

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
            city:           extracted.city          ?? 'Non précisé',
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
            deadline:       parseFlexibleDateText(extracted.deadline) ?? item.deadline,
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
        city:         'Non précisé',
        country:      this.country,
        description:  item.excerpt,
        deadline:     item.deadline,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default GouvBjScraper
