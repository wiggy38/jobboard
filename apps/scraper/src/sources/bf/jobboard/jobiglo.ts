import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractDeadline, extractEmail } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://bf.jobiglo.com'
const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function parseRelativeFrenchDate(raw: string): Date | undefined {
  // "il y a 17 heures" / "il y a 3 jours" / "il y a 2 mois"
  const m = raw.trim().match(/il y a\s+(\d+)\s+(heure|jour|semaine|mois)/i)
  if (!m) return undefined
  const amount = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const now = new Date()
  const msPerUnit: Record<string, number> = {
    heure: 3_600_000,
    jour: 86_400_000,
    semaine: 7 * 86_400_000,
    mois: 30 * 86_400_000,
  }
  const delta = msPerUnit[unit]
  if (!delta) return undefined
  return new Date(now.getTime() - amount * delta)
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  publishedAt?: Date
  description?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const titleLink = $card.find('h3 a').first()
  const title = extractText(titleLink)
  if (!title) return null

  const sourceUrl = titleLink.attr('href') ?? ''
  if (!sourceUrl) return null

  const organization = extractText($card.find('p.text-sm.text-gray-500').first())

  const city = extractText($card.find('.flex.flex-wrap.items-center.gap-x-4 span').first()) || 'Ouagadougou'

  const description = extractText($card.find('p.line-clamp-2')).slice(0, 500)

  const relativeDateText = extractText($card.find('.text-xs.text-gray-400').first())
  const publishedAt = parseRelativeFrenchDate(relativeDateText)

  return { title, sourceUrl, organization, city, publishedAt, description }
}

export class JobigloScraper extends BaseScraper {
  readonly name = 'jobiglo'
  readonly url = `${BASE_URL}/emplois`

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    let html = ''
    try {
      info(this.name, `Fetching listing: ${this.url}`)
      const resp = await axios.get(this.url, { headers: HTTP_HEADERS, timeout: 15_000 })
      if (resp.status === 200) html = resp.data as string
    } catch (err) {
      const msg = `Listing URL failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    if (!html) {
      errors.push('Listing vide — réseau injoignable ou site down')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const $ = cheerio.load(html)
    const cardEls = $('.bg-white.rounded-xl.shadow-sm.p-5').toArray()

    if (cardEls.length === 0) {
      const dump = html.slice(0, 500)
      warn(this.name, `Aucune offre détectée. Dump HTML : ${dump}`)
      errors.push('Structure HTML non reconnue — intervention manuelle requise')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Found ${cardEls.length} cards`)

    const cardDataList: CardData[] = []
    for (const el of cardEls) {
      const data = extractCardData($, el)
      if (data) cardDataList.push(data)
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await new Promise((resolve) => setTimeout(resolve, POLITE_DELAY_MS))

      let fullDescription = card.description ?? ''
      let contactEmail: string | undefined
      let deadline: Date | undefined
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style, nav, header, footer, [class*="menu"], [class*="sidebar"]').remove()

        const descText = extractText($d('.prose').first())
        if (descText.length > 50) fullDescription = descText.slice(0, 3000)

        const bodyText = $d('body').text()
        contactEmail = extractEmail(bodyText)
        deadline = extractDeadline(bodyText)

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
        sector: extracted.sector,
        level: extracted.level,
        contractType: extracted.contractType,
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

    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization || 'Non précisé',
        city: card.city,
        description: card.description || undefined,
        publishedAt: card.publishedAt,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default JobigloScraper
