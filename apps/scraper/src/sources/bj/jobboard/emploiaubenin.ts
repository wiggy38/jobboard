import axios from 'axios'
import * as cheerio from 'cheerio'
import { BrowserContext } from 'playwright'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { getBrowser } from '../../../lib/browser'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Plugin WordPress "WP Job Board" dont la liste est injectée en JS (un GET
// axios brut renvoie 0 carte) : Playwright obligatoire en Phase 1. Les
// fiches détail (post type "jb-job") sont en revanche des pages WordPress
// classiques servies côté serveur — axios suffit en Phase 2. Cartes en
// "div.jb-job-list-row" : titre+lien ".jb-job-title-link", organisation
// ".company span", ville ".location a", type de contrat ".jb-job-type",
// clôture dans ".expires" ("Date de clôture DD mois YYYY").
const BASE_URL = 'https://www.emploiaubenin.com'
const SITE_URL = `${BASE_URL}/jobs/`
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HTTP_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

interface ListingItem {
  title: string
  sourceUrl: string
  organization?: string
  city?: string
  contractType?: string
  sector?: string
  deadline?: Date
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
  if (lower.includes('indéterminée') || lower.includes('cdi')) return 'CDI'
  if (lower.includes('déterminée') || lower.includes('cdd')) return 'CDD'
  if (lower.includes('stage')) return 'STAGE'
  if (lower.includes('alternance')) return 'ALTERNANCE'
  if (lower.includes('freelance') || lower.includes('consultant')) return 'FREELANCE'
  if (lower.includes('bénévol')) return 'BENEVOLE'
  return 'AUTRE'
}

async function fetchListingPage(context: BrowserContext): Promise<ListingItem[]> {
  const page = await context.newPage()
  let html: string
  try {
    await page.goto(SITE_URL, { timeout: 30_000, waitUntil: 'networkidle' })
    html = await page.content()
  } finally {
    await page.close()
  }

  const $ = cheerio.load(html)
  const items: ListingItem[] = []

  $('.jb-job-list-row').each((_i, el) => {
    const $card = $(el)
    const $link = $card.find('.jb-job-title-link').first()
    const title = extractText($link)
    const href = $link.attr('href') ?? ''
    if (!title || !href) return
    if (isLikelyNotJobOffer(title, href)) return

    const organization = extractText($card.find('.company span').first()) || undefined
    const city = extractText($card.find('.location a').first()) || undefined
    const contractType = mapContractType(extractText($card.find('.jb-job-type').first()))
    const sector = extractText($card.find('.category a').first()) || undefined
    const deadlineText = extractText($card.find('.expires').first()).replace(/^Date de clôture\s*/i, '')

    items.push({ title, sourceUrl: href, organization, city, contractType, sector, deadline: parseFlexibleDateText(deadlineText) })
  })

  return items
}

export class EmploiAuBeninScraper extends BaseScraper {
  readonly name = 'emploiaubenin'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const browser = await getBrowser()
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'fr-FR' })

    let listings: ListingItem[] = []
    try {
      listings = await fetchListingPage(context)
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      await context.close()
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    } finally {
      await context.close()
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
        const pageText = extractText(d$('article').first()) || extractText(d$('body'))

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
            sector:         extracted.sector        ?? item.sector,
            level:          extracted.level,
            contractType:   extracted.contractType   ?? item.contractType,
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
        sector:       item.sector,
        contractType: item.contractType,
        deadline:     item.deadline,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default EmploiAuBeninScraper
