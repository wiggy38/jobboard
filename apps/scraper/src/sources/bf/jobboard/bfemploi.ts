import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractEmail, extractPhone } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://bfemploi.com'
const LISTING_URL = `${BASE_URL}/emplois-annonces.html`
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

function toAbsUrl(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function parseSlashDate(raw: string): Date | undefined {
  // DD/MM/YYYY — date de publication sur la page liste
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return undefined
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

function parseDashDate(raw: string): Date | undefined {
  // DD-MM-YYYY — date de clôture sur la page liste
  const m = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (!m) return undefined
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

function parseFrenchLongDate(raw: string): Date | undefined {
  // "13 juillet 2026"
  const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (!m) return undefined
  const month = FRENCH_MONTHS[m[2].toLowerCase()]
  if (month === undefined) return undefined
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  contractType?: string
  sector?: string
  publishedAt?: Date
  deadline?: Date
}

// Chaque annonce liste = div.div_rz_ance_gnral. Les champs (recruteur, lieu,
// type de contrat, secteur) sont dans l'ordre fixe des icônes fa-institution,
// fa-map-marker, fa-file-text, fa-tag → les liens a.ss_miz_f correspondants
// suivent le même ordre. Les dates utilisent deux formats distincts
// (DD/MM/YYYY = publication, DD-MM-YYYY = clôture) ce qui permet de les
// distinguer sans dépendre des icônes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const title = extractText($card.find('.ance_titre'))
  if (!title) return null

  const href = $card.find('a[href^="annonce-details"]').first().attr('href') ?? ''
  const sourceUrl = toAbsUrl(href)
  if (!sourceUrl) return null

  const links = $card.find('a.ss_miz_f')
  const organization = extractText(links.eq(0)) || 'Non précisé'
  const city = extractText(links.eq(1)) || 'Burkina Faso'
  const contractType = extractText(links.eq(2)) || undefined
  const sector = extractText(links.eq(3)) || undefined

  const infoText = extractText($card.find('.tab_rz_ance'))
  const slashMatch = infoText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)
  const dashMatch = infoText.match(/\d{1,2}-\d{1,2}-\d{4}/)
  const publishedAt = slashMatch ? parseSlashDate(slashMatch[0]) : undefined
  const deadline = dashMatch ? parseDashDate(dashMatch[0]) : undefined

  return { title, sourceUrl, organization, city, contractType, sector, publishedAt, deadline }
}

export class BfEmploiScraper extends BaseScraper {
  readonly name = 'bfemploi'
  readonly url = LISTING_URL

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    let html = ''
    try {
      info(this.name, `Fetching listing: ${LISTING_URL}`)
      const resp = await axios.get(LISTING_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
      if (resp.status === 200) html = resp.data as string
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      warn(this.name, msg)
    }

    if (!html) {
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const $ = cheerio.load(html)
    const cardEls = $('.div_rz_ance_gnral').toArray()

    if (cardEls.length === 0) {
      errors.push('Structure HTML non reconnue — intervention manuelle requise')
      warn(this.name, `Aucune offre détectée. Dump HTML : ${html.slice(0, 500)}`)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const cardDataList: CardData[] = []
    for (const el of cardEls) {
      const data = extractCardData($, el)
      if (data) cardDataList.push(data)
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await sleep(POLITE_DELAY_MS)

      let description: string | undefined
      let contactEmail: string | undefined
      let contactPhone: string | undefined
      let publishedAt = card.publishedAt
      let deadline = card.deadline
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style, nav, header, footer, aside, [id*="menu"]').remove()

        const descText = extractText($d('#contenu_ance article'))
        if (descText.length > 50) description = descText.slice(0, 3000)

        const bodyText = $d('body').text()
        contactEmail = extractEmail(bodyText)
        contactPhone = extractPhone(bodyText)

        const publishedMatch = bodyText.match(/Publiée le\s*(\d{1,2}\s+\w+\s+\d{4})/i)
        if (publishedMatch) publishedAt = parseFrenchLongDate(publishedMatch[1]) ?? publishedAt

        const clotureMatch = bodyText.match(/(\d{1,2}-\d{1,2}-\d{4})/)
        if (clotureMatch) deadline = parseDashDate(clotureMatch[1]) ?? deadline

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
        sector: extracted.sector ?? card.sector,
        contractType: extracted.contractType ?? card.contractType,
        description: extracted.description ?? description,
        requirements: extracted.requirements,
        contactEmail: extracted.contactEmail ?? contactEmail,
        contactPhone: extracted.contactPhone ?? contactPhone,
        contactAddress: extracted.contactAddress,
        applicationUrl: extracted.applicationUrl,
        deadline: parseFlexibleDateText(extracted.deadline) ?? deadline,
        publishedAt: publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
        sourceUrl: card.sourceUrl,
        isSponsored: extracted.isSponsored,
        isFraudSuspect: extracted.isFraudSuspect,
      })

      info(this.name, `Scraped: "${card.title.slice(0, 60)}"`)
    }

    // Offres restantes au-delà de DETAIL_LIMIT — données de la liste uniquement
    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization,
        city: card.city,
        sector: card.sector,
        contractType: card.contractType,
        publishedAt: card.publishedAt,
        deadline: card.deadline,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default BfEmploiScraper
