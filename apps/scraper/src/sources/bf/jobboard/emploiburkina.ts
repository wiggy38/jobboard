import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractDeadline, extractEmail } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://www.emploiburkina.com'
const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function toAbsUrl(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
}

function parseShortDate(raw: string): Date | undefined {
  // Handles DD.MM.YYYY (site's own format) and DD/MM/YYYY
  const m = raw.trim().match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }
  return undefined
}

function parseFrenchDate(raw: string): Date | undefined {
  const cleaned = raw.trim()
  // Try numeric first
  const shortDate = parseShortDate(cleaned)
  if (shortDate) return shortDate
  // "12 juin 2024"
  const m = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (m) {
    const month = FRENCH_MONTHS[m[2].toLowerCase()]
    if (month !== undefined) {
      const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10))
      if (!isNaN(d.getTime())) return d
    }
  }
  return undefined
}

// ---- Extraction helpers for .card-job (listing page) ----

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  publishedAt?: Date
  contractType?: string
  level?: string
  description?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardJobData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const title =
    extractText($card.find('h3 a')) ||
    $card.find('h3 a').attr('title')?.trim() ||
    ''
  if (!title) return null

  const sourceUrl =
    $card.attr('data-href') ||
    toAbsUrl($card.find('h3 a').attr('href') ?? '')
  if (!sourceUrl) return null

  const organization = extractText($card.find('a.company-name, a.card-job-company'))

  // City from "Région de : <strong>Ouagadougou</strong>"
  let city = 'Ouagadougou'
  $card.find('ul li').each((_i, li) => {
    const liText = $(li).text()
    if (liText.match(/r[eé]gion/i)) {
      const strong = extractText($(li).find('strong'))
      if (strong) city = strong
    }
  })
  // Also try from card class variation with .last-offers-region
  const regionEl = extractText($card.find('.last-offers-region'))
  if (regionEl) city = regionEl.replace(/r[eé]gion\s+de\s*:\s*/i, '').trim() || city

  // Published date from <time datetime="YYYY-MM-DD"> or <span>DD.MM.YYYY</span>
  let publishedAt: Date | undefined
  const datetimeAttr = $card.find('time[datetime]').attr('datetime')
  if (datetimeAttr) {
    const d = new Date(datetimeAttr)
    if (!isNaN(d.getTime())) publishedAt = d
  }
  if (!publishedAt) {
    const spanDate = extractText($card.find('p.job-recruiter span, .date span, time'))
    if (spanDate) publishedAt = parseFrenchDate(spanDate)
  }

  // Contract type from "Contrat proposé : <strong>CDI</strong>"
  let contractType: string | undefined
  $card.find('ul li').each((_i, li) => {
    const liText = $(li).text()
    if (liText.match(/contrat/i)) {
      const strong = extractText($(li).find('strong'))
      if (strong) contractType = strong
    }
  })

  // Level from "Niveau d'études requis : <strong>Bac+3</strong>"
  let level: string | undefined
  $card.find('ul li').each((_i, li) => {
    const liText = $(li).text()
    if (liText.match(/niveau.{0,10}[eé]tudes/i)) {
      const strong = extractText($(li).find('strong'))
      if (strong) level = strong
    }
  })

  // Short description from card excerpt
  const description = extractText($card.find('.card-job-description p, .last-offers-details p.job-recruiter'))
    .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s*/, '')  // strip leading date
    .slice(0, 500)

  return { title, sourceUrl, organization, city, publishedAt, contractType, level, description }
}

// ---- Extraction helpers for .last-offers-item (homepage) ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLastOffersItemData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const titleLink = $card.find('.last-offers-details h3 a, h3 a').first()
  const title = extractText(titleLink)
  if (!title) return null

  const sourceUrl = toAbsUrl(titleLink.attr('href') ?? $card.attr('data-href') ?? '')
  if (!sourceUrl) return null

  const organization = extractText($card.find('a.company-name'))

  let city = 'Ouagadougou'
  const regionText = extractText($card.find('.last-offers-region'))
  if (regionText) city = regionText.replace(/r[eé]gion\s+de\s*:\s*/i, '').trim() || city

  let publishedAt: Date | undefined
  const spanDate = extractText($card.find('p.job-recruiter > span, time'))
  if (spanDate) publishedAt = parseFrenchDate(spanDate)

  return { title, sourceUrl, organization, city, publishedAt }
}

export class EmploiBurkinaScraper extends BaseScraper {
  readonly name = 'emploiburkina'
  readonly url = `${BASE_URL}/recherche-jobs-burkina-faso`

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    // ---- Step 1: Fetch a listing page (try multiple URLs) ----
    const listingUrls = [
      `${BASE_URL}/recherche-jobs-burkina-faso`,
      BASE_URL,
    ]

    let html = ''
    let usedUrl = ''

    for (const url of listingUrls) {
      try {
        info(this.name, `Trying listing URL: ${url}`)
        const resp = await axios.get(url, { headers: HTTP_HEADERS, timeout: 15_000 })
        if (resp.status === 200) {
          html = resp.data as string
          usedUrl = url
          info(this.name, `Fetched listing from: ${url}`)
          break
        }
      } catch (err) {
        warn(this.name, `URL ${url} failed: ${this.handleError(err)}`)
      }
    }

    if (!html) {
      const msg = 'All listing URLs failed — network unreachable or site down'
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    // ---- Step 2: Parse cards using known selectors ----
    const $ = cheerio.load(html)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawCard = { el: any; type: 'card-job' | 'last-offers-item' }
    let rawCards: RawCard[] = []

    const cardJobEls = $('.card-job').toArray()
    if (cardJobEls.length > 0) {
      rawCards = cardJobEls.map((el) => ({ el, type: 'card-job' as const }))
      info(this.name, `Found ${cardJobEls.length} cards with selector .card-job`)
    } else {
      const lastOffersEls = $('.last-offers-item, div[class*="last-offers-item"]').toArray()
      if (lastOffersEls.length > 0) {
        rawCards = lastOffersEls.map((el) => ({ el, type: 'last-offers-item' as const }))
        info(this.name, `Found ${lastOffersEls.length} cards with selector .last-offers-item`)
      }
    }

    if (rawCards.length === 0) {
      const dump = html.slice(0, 500)
      const msg = `Aucune offre détectée. Dump HTML : ${dump}`
      errors.push('Structure HTML non reconnue — intervention manuelle requise')
      warn(this.name, msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    // ---- Step 3: Extract card data ----
    const cardDataList: CardData[] = []
    for (const { el, type } of rawCards) {
      const data = type === 'card-job'
        ? extractCardJobData($, el)
        : extractLastOffersItemData($, el)
      if (data) cardDataList.push(data)
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    // ---- Step 4: Enrich top N offers with detail pages (offres jamais vues priorisées) ----
    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await sleep(POLITE_DELAY_MS)

      let fullDescription = card.description ?? ''
      let contactEmail: string | undefined
      let deadline: Date | undefined
      let sector: string | undefined
      let finalContractType = card.contractType
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style, nav, header, footer, [class*="menu"], [class*="sidebar"]').remove()

        // Full description — .job-description is confirmed present (4 matches)
        const descSelectors = ['.job-description', '.field-body', '.description', '.node__content .field', 'article .body']
        for (const sel of descSelectors) {
          const txt = extractText($d(sel))
          if (txt.length > 50) { fullDescription = txt.slice(0, 3000); break }
        }

        // Email from detail page
        const bodyText = $d('body').text()
        contactEmail = extractEmail(bodyText)

        // Deadline — requires an actual date after keyword
        deadline = extractDeadline(bodyText)

        // Sector from meta or structured data
        const sectorMatch = bodyText.match(/(?:secteur\s*d['']activit[eé]|domaine)\s*:?\s*([^\n,;]{3,60})/i)
        if (sectorMatch) sector = sectorMatch[1].trim()

        // Contract type enrichment (detail may be more precise)
        if (!finalContractType) {
          const contractMatch = bodyText.match(/type\s+de\s+contrat\s*:?\s*([^\n,;]{3,40})/i)
          if (contractMatch) finalContractType = contractMatch[1].trim()
        }

        // ── Haiku extrait/complète les champs structurés depuis le texte brut ──
        const pageText = bodyText.replace(/\s{3,}/g, '\n').trim()
        extracted = await extractWithHaiku(pageText, card.title, this.name)
      } catch (err) {
        const msg = `Failed to fetch detail page ${card.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }

      const offer: RawJobOffer = {
        title: extracted.title ?? card.title,
        organization: extracted.organization ?? (card.organization || 'Non précisé'),
        city: extracted.city ?? card.city,
        sector: extracted.sector ?? sector,
        level: extracted.level ?? card.level,
        contractType: extracted.contractType ?? finalContractType,
        description: extracted.description ?? (fullDescription || undefined),
        requirements: extracted.requirements,
        contactEmail: extracted.contactEmail ?? contactEmail,
        contactPhone: extracted.contactPhone,
        contactAddress: extracted.contactAddress,
        applicationUrl: extracted.applicationUrl,
        deadline: parseFlexibleDateText(extracted.deadline) ?? deadline,
        publishedAt: card.publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
        sourceUrl: card.sourceUrl,
        isSponsored: extracted.isSponsored,
        isFraudSuspect: extracted.isFraudSuspect,
      }

      offers.push(offer)
      info(this.name, `Scraped: "${card.title.slice(0, 60)}"`)
    }

    // Remaining cards (beyond DETAIL_LIMIT) — use listing data only
    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization || 'Non précisé',
        city: card.city,
        level: card.level,
        contractType: card.contractType,
        description: card.description || undefined,
        publishedAt: card.publishedAt,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors. Source: ${usedUrl}`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default EmploiBurkinaScraper
