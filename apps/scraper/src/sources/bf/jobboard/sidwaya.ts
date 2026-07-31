import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://www.sidwaya.info'
const CATEGORY_PATH = '/bfcategories/focus/communique'
const LISTING_PAGES = 3
// Catégorie "COMMUNIQUE" mélange annonces d'offres d'emploi et actualité
// générale (politique, faits-divers, sport...) — Haiku rejette silencieusement
// tout ce qui n'est pas une fiche d'offre, d'où un budget de détail plus large
// que sur les sources dédiées à l'emploi.
const DETAIL_LIMIT = 15
const POLITE_DELAY_MS = 1500
const HTTP_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

interface ListingItem {
  title: string
  link: string
  publishedAt?: Date
}

export class SidwayaScraper extends BaseScraper {
  readonly name = 'sidwaya'
  readonly url = `${BASE_URL}${CATEGORY_PATH}/`

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const listings: ListingItem[] = []
    const seenLinks = new Set<string>()

    for (let page = 1; page <= LISTING_PAGES; page++) {
      const pageUrl = page === 1 ? this.url : `${BASE_URL}${CATEGORY_PATH}/page/${page}/`
      info(this.name, `Fetching listing page ${page}: ${pageUrl}`)

      let html: string
      try {
        const response = await axios.get(pageUrl, { timeout: 15_000, headers: HTTP_HEADERS })
        html = response.data as string
      } catch (err) {
        const msg = `Listing fetch failed (page=${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      const $ = cheerio.load(html)
      let foundOnPage = 0

      $('h3.entry-title a, h2.entry-title a').each((_i, el) => {
        const a = $(el)
        const title = extractText(a)
        const link = a.attr('href') ?? ''
        if (!title || !link || seenLinks.has(link)) return
        seenLinks.add(link)
        foundOnPage++
        listings.push({ title, link })
      })

      if (foundOnPage === 0) break
      if (page < LISTING_PAGES) await sleep(POLITE_DELAY_MS)
    }

    if (listings.length === 0) {
      errors.push('Could not find any article links on the listing page — HTML structure may have changed')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Found ${listings.length} articles on listing pages`)

    const filteredListings = listings.filter(item => !isLikelyNotJobOffer(item.title, item.link))
    const ordered = prioritizeUnseen(filteredListings, item => item.link, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailHtml = await axios.get(item.link, { timeout: 15_000, headers: HTTP_HEADERS })
        const d$ = cheerio.load(detailHtml.data as string)
        d$('script, style, nav, header, footer, [class*="menu"], [class*="sidebar"], [class*="comment"]').remove()

        const description = extractText(d$('.td-post-content')) || extractText(d$('article'))

        let contactEmail: string | undefined
        const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
        if (emailMatch) contactEmail = emailMatch[0]

        let publishedAt: Date | undefined
        const dateAttr = d$('time.entry-date').first().attr('datetime')
        if (dateAttr) {
          const parsed = new Date(dateAttr)
          if (!isNaN(parsed.getTime())) publishedAt = parsed
        }

        const pageText = extractText(d$('body')).replace(/\s{3,}/g, '\n')
        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}"`)
          continue
        }

        for (const extracted of extractedOffers) {
          offers.push({
            title: extracted.title ?? item.title,
            organization: extracted.organization ?? 'Non précisé',
            city: extracted.city ?? 'Ouagadougou',
            sector: extracted.sector,
            level: extracted.level,
            contractType: extracted.contractType,
            description: extracted.description ?? description.slice(0, 3000),
            requirements: extracted.requirements,
            contactEmail: extracted.contactEmail ?? contactEmail,
            contactPhone: extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline: parseFlexibleDateText(extracted.deadline),
            publishedAt: publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
            sourceUrl: item.link,
            isSponsored: extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          })

          info(this.name, `Scraped: "${item.title.slice(0, 60)}"`)
        }
      } catch (err) {
        const msg = `Failed to scrape ${item.link}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default SidwayaScraper
