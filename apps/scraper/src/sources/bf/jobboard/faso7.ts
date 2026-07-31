import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://faso7.com'
const CATEGORY_PATH = '/category/avis-de-recrutement'
const LISTING_PAGES = 3
const DETAIL_LIMIT = 12
const POLITE_DELAY_MS = 1500

// L'UA Chrome standard reçoit un 403 (WAF) sur ce site — un UA de crawler
// connu (Googlebot) passe sans blocage, sur les pages liste comme détail.
const HTTP_HEADERS = { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function parseSlashDate(raw: string): Date | undefined {
  // DD/MM/YYYY — date affichée sur la page liste
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return undefined
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

interface ListingItem {
  title: string
  link: string
  publishedAt?: Date
}

export class Faso7Scraper extends BaseScraper {
  readonly name = 'faso7'
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

      $('li.post-item').each((_i, el) => {
        const $card = $(el)
        const titleLink = $card.find('h2.post-title a').first()
        const title = extractText(titleLink)
        const link = titleLink.attr('href') ?? ''
        if (!title || !link || seenLinks.has(link)) return
        seenLinks.add(link)
        foundOnPage++

        const dateText = extractText($card.find('span.date'))
        const publishedAt = parseSlashDate(dateText)

        listings.push({ title, link, publishedAt })
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
        d$('script, style, nav, header, footer, aside, [class*="mashsb"], [class*="menu"], [class*="sidebar"], [class*="comment"]').remove()

        const description = extractText(d$('.entry-content')) || extractText(d$('article'))

        let contactEmail: string | undefined
        const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
        if (emailMatch) contactEmail = emailMatch[0]

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
            publishedAt: item.publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
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

export default Faso7Scraper
