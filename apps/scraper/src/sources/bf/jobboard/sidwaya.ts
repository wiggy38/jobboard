import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://www.sidwaya.info'
// "focus/communique" mélange annonces d'offres d'emploi et actualité générale
// (politique, faits-divers, sport...) — Haiku rejette silencieusement tout ce
// qui n'est pas une fiche d'offre, d'où un budget de détail plus large que sur
// "emploi", catégorie dédiée et plus propre. Le budget est alloué par
// catégorie (pas un pool global) : sinon les nombreux articles de
// "communique" épuisent la limite avant même d'atteindre "emploi".
const CATEGORIES = [
  { path: '/bfcategories/focus/communique', detailLimit: 12 },
  { path: '/bfcategories/emploi', detailLimit: 10 },
]
const LISTING_PAGES = 3
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
  readonly url = `${BASE_URL}${CATEGORIES[0].path}/`

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const seenLinks = new Set<string>()
    const targets: ListingItem[] = []

    for (const category of CATEGORIES) {
      const listings: ListingItem[] = []

      for (let page = 1; page <= LISTING_PAGES; page++) {
        const pageUrl = page === 1 ? `${BASE_URL}${category.path}/` : `${BASE_URL}${category.path}/page/${page}/`
        info(this.name, `Fetching listing page ${page}: ${pageUrl}`)

        let html: string
        try {
          const response = await axios.get(pageUrl, { timeout: 15_000, headers: HTTP_HEADERS })
          html = response.data as string
        } catch (err) {
          // Une page de pagination au-delà de la dernière renvoie 404 — fin normale
          // de catégorie, pas une erreur à remonter.
          if (axios.isAxiosError(err) && err.response?.status === 404) break
          const msg = `Listing fetch failed (category=${category.path}, page=${page}): ${this.handleError(err)}`
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

      info(this.name, `Found ${listings.length} articles on ${category.path}`)

      const filteredListings = listings.filter(item => !isLikelyNotJobOffer(item.title, item.link))
      const ordered = prioritizeUnseen(filteredListings, item => item.link, seenSourceUrls)
      targets.push(...ordered.slice(0, category.detailLimit))
    }

    if (targets.length === 0) {
      errors.push('Could not find any article links on the listing pages — HTML structure may have changed')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

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
