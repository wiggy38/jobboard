import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractPhone, extractEmail } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

const SITE_URL = 'https://www.criburkina.com'
const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

// Both pages are scraped: homepage has featured active offers, /listeroffre has the full list
const HOMEPAGE_URL = SITE_URL
const LISTING_URL = `${SITE_URL}/listeroffre`

const CITY_REGEX = /(Ouagadougou|Bobo-Dioulasso|Koudougou|Banfora|Ouahigouya)/i
const CLIENT_REGEX = /pour le compte de ([A-Z][^.]+)|client\s*:\s*([^\n]+)/i

// Detail page description selectors
const DESC_SELECTORS = [
  '.dashboard-caption-wrap',
  '.dashboard-caption',
  '.entry-content',
  '.post-content',
  'article .content',
]

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
}

function parseDate(raw: string): Date | undefined {
  const s = raw.trim()
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const numM = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (numM) {
    const day = parseInt(numM[1], 10)
    const month = parseInt(numM[2], 10) - 1
    const year = numM[3].length === 2 ? 2000 + parseInt(numM[3], 10) : parseInt(numM[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }
  // "12 juin 2024"
  const frM = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (frM) {
    const month = FRENCH_MONTHS[frM[2].toLowerCase()]
    if (month !== undefined) {
      const d = new Date(parseInt(frM[3], 10), month, parseInt(frM[1], 10))
      if (!isNaN(d.getTime())) return d
    }
  }
  return undefined
}

function normalizeContractType(raw: string): string | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase()
  if (/\bcdi\b/.test(s)) return 'CDI'
  if (/\bcdd\b/.test(s)) return 'CDD'
  if (/\bstage\b/.test(s)) return 'STAGE'
  if (/\balternance\b/.test(s)) return 'ALTERNANCE'
  if (/\bfreelance\b|consultant/.test(s)) return 'FREELANCE'
  if (/b[eé]n[eé]vol/.test(s)) return 'BENEVOLE'
  return raw.trim() || undefined
}

interface DetailWrapData {
  sector?: string
  level?: string
  contractType?: string
  deadline?: Date
  publishedAt?: Date
}

/**
 * Extracts structured fields from div.ur-detail-wrap using label-value scanning.
 * Supports dt/dd, th/td, and generic label+sibling patterns.
 */
function extractFromDetailWrap($d: cheerio.CheerioAPI): DetailWrapData {
  const wrap = $d('div.ur-detail-wrap')
  if (!wrap.length) return {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function findValue(labelText: string): string {
    let result = ''
    const lc = labelText.toLowerCase()

    // dt/dd
    wrap.find('dt').each((_i, el) => {
      if ($d(el).text().replace(/\s*:\s*$/, '').trim().toLowerCase() === lc) {
        result = $d(el).next('dd').text().replace(/\s+/g, ' ').trim()
        return false
      }
    })
    if (result) return result

    // th/td
    wrap.find('th').each((_i, el) => {
      if ($d(el).text().replace(/\s*:\s*$/, '').trim().toLowerCase() === lc) {
        result = $d(el).next('td').text().replace(/\s+/g, ' ').trim()
        return false
      }
    })
    if (result) return result

    // Generic: element whose own text (no children) matches label → next sibling or parent next sibling
    wrap.find('*').each((_i, el) => {
      const ownText = $d(el).clone().children().remove().end().text().replace(/\s*:\s*$/, '').trim()
      if (ownText.toLowerCase() === lc) {
        const next = $d(el).next()
        if (next.length) { result = next.text().replace(/\s+/g, ' ').trim(); return false }
        const parentNext = $d(el).parent().next()
        if (parentNext.length) { result = parentNext.text().replace(/\s+/g, ' ').trim(); return false }
      }
    })
    return result
  }

  const sectorRaw = findValue('domaine')
  const levelRaw = findValue('niveau')
  const contractRaw = findValue('type contrat')
  const deadlineRaw = findValue('date limite de candidature')
  const publishedRaw = findValue('date de publication')

  return {
    sector: sectorRaw || undefined,
    level: levelRaw || undefined,
    contractType: normalizeContractType(contractRaw),
    deadline: deadlineRaw ? parseDate(deadlineRaw) : undefined,
    publishedAt: publishedRaw ? parseDate(publishedRaw) : undefined,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toAbsUrl(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return `${SITE_URL}${href.startsWith('/') ? '' : '/'}${href}`
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
}

/**
 * Parse the /listeroffre dashboard layout:
 *   div.dashboard-gravity-list > ul > li
 *   title = li > strong
 *   link  = li a[href*="offredetail"]
 *   skip  = li span.badge1 "Archivée"
 */
function parseDashboardLayout($: cheerio.CheerioAPI): CardData[] {
  const results: CardData[] = []
  $('div.dashboard-gravity-list li').each((_i, el) => {
    const $li = $(el)
    const badge = $li.find('span.badge1').text().trim()
    if (/archiv/i.test(badge)) return // skip archived

    const title = $li.find('strong').first().text().replace(/\s+/g, ' ').trim()
    const href = $li.find('a[href*="offredetail"]').attr('href')
    if (!title || !href) return

    const sourceUrl = toAbsUrl(href)
    const cityMatch = CITY_REGEX.exec($li.text())
    const city = cityMatch ? cityMatch[0] : 'Ouagadougou'
    results.push({ title, sourceUrl, organization: 'CRI Burkina Faso', city })
  })
  return results
}

/**
 * Parse homepage featured jobs:
 *   div.brows-job-list
 *   title = first a[href*="offredetail"] whose text is not generic
 *   location = .brows-job-location
 */
function parseHomepageLayout($: cheerio.CheerioAPI): CardData[] {
  const GENERIC = /^(en savoir plus|voir l.offre|postuler|détail|detail|lire la suite)$/i
  const results: CardData[] = []

  $('div.brows-job-list, div.item-click').each((_i, el) => {
    const $card = $(el)
    let title = ''
    let sourceUrl = ''

    $card.find('a[href*="offredetail"]').each((_j, a) => {
      const text = $(a).text().replace(/\s+/g, ' ').trim()
      const href = $(a).attr('href')
      if (text && href && !GENERIC.test(text) && !title) {
        title = text
        sourceUrl = toAbsUrl(href)
      }
    })

    if (!title || !sourceUrl) return

    const location = $card.find('.brows-job-location').text().trim()
    const cityMatch = CITY_REGEX.exec(location || $card.text())
    const city = cityMatch ? cityMatch[0] : 'Ouagadougou'

    results.push({ title, sourceUrl, organization: 'CRI Burkina Faso', city })
  })
  return results
}

export class CriBurkinaScraper extends BaseScraper {
  readonly name = 'criburkina'
  readonly url = `${SITE_URL}/listeroffre`

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    // Step 1: Fetch both pages and combine results
    const seen = new Set<string>()
    const cardDataList: CardData[] = []

    const fetchAndParse = async (url: string) => {
      try {
        info(this.name, `Fetching: ${url}`)
        const resp = await axios.get(url, { headers: HTTP_HEADERS, timeout: 15_000 })
        if (resp.status !== 200) return
        const $ = cheerio.load(resp.data as string)

        const fromDashboard = parseDashboardLayout($)
        const fromHomepage = parseHomepageLayout($)
        const candidates = fromDashboard.length > 0 ? fromDashboard : fromHomepage

        let added = 0
        for (const card of candidates) {
          if (!seen.has(card.sourceUrl)) {
            seen.add(card.sourceUrl)
            cardDataList.push(card)
            added++
          }
        }
        info(this.name, `${url} → +${added} offers (${fromDashboard.length} dashboard, ${fromHomepage.length} homepage layout)`)
      } catch (err) {
        warn(this.name, `Failed to fetch ${url}: ${this.handleError(err)}`)
      }
    }

    await fetchAndParse(HOMEPAGE_URL)
    await fetchAndParse(LISTING_URL)

    if (cardDataList.length === 0) {
      errors.push('Aucune offre active trouvée — site peut nécessiter une révision manuelle')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    // Step 3: Enrich top N offers with detail pages (offres jamais vues priorisées)
    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await sleep(POLITE_DELAY_MS)

      let description: string | undefined
      let contactEmail: string | undefined
      let contactPhone: string | undefined
      let sector: string | undefined
      let level: string | undefined
      let contractType: string | undefined
      let deadline: Date | undefined
      let publishedAt: Date | undefined
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style').remove()
        const bodyText = $d('body').text()

        for (const sel of DESC_SELECTORS) {
          const txt = $d(sel).text().replace(/\s+/g, ' ').trim()
          if (txt.length > 50) { description = txt.slice(0, 3000); break }
        }

        const structured = extractFromDetailWrap($d)
        sector = structured.sector
        level = structured.level
        contractType = structured.contractType
        deadline = structured.deadline
        publishedAt = structured.publishedAt

        contactEmail = extractEmail(bodyText)
        contactPhone = extractPhone(bodyText)

        if (card.organization === 'CRI Burkina Faso') {
          const clientMatch = CLIENT_REGEX.exec(bodyText)
          if (clientMatch) card.organization = (clientMatch[1] ?? clientMatch[2]).trim()
        }

        const cityMatch = CITY_REGEX.exec(bodyText)
        if (cityMatch && card.city === 'Ouagadougou') card.city = cityMatch[0]

        // ── Haiku extrait/complète les champs structurés depuis le texte brut ──
        const pageText = bodyText.replace(/\s{3,}/g, '\n').trim()
        extracted = await extractWithHaiku(pageText, card.title, this.name)
      } catch (err) {
        const msg = `Failed to fetch detail page ${card.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }

      offers.push({
        title: extracted.title ?? card.title,
        organization: extracted.organization ?? card.organization,
        city: extracted.city ?? card.city,
        sector: extracted.sector ?? sector,
        level: extracted.level ?? level,
        contractType: extracted.contractType ?? contractType,
        description: extracted.description ?? description,
        requirements: extracted.requirements,
        contactEmail: extracted.contactEmail ?? contactEmail,
        contactPhone: extracted.contactPhone ?? contactPhone,
        contactAddress: extracted.contactAddress,
        applicationUrl: extracted.applicationUrl,
        deadline: parseFlexibleDateText(extracted.deadline) ?? deadline,
        // Signal déterministe (page détail) priorisé sur l'extraction Haiku
        // en texte libre, qui peut varier d'un run à l'autre pour le même HTML.
        publishedAt: publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
        sourceUrl: card.sourceUrl,
        isSponsored: extracted.isSponsored,
        isFraudSuspect: extracted.isFraudSuspect,
      })

      info(this.name, `Scraped: "${card.title.slice(0, 60)}"`)
    }

    // Remaining cards beyond DETAIL_LIMIT — listing data only
    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization,
        city: card.city,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default CriBurkinaScraper
