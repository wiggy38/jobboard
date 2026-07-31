import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractEmail, extractPhone } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Endpoint "guest" non authentifié utilisé par la pagination infinie de
// linkedin.com/jobs/search — retourne un fragment HTML de fiches, sans
// nécessiter de compte ni de token. Plus fragile qu'une API officielle (peut
// être bloqué/rate-limité à tout moment), d'où les délais polis et la
// tolérance aux échecs partiels ci-dessous.
const BASE_URL = 'https://www.linkedin.com/jobs'
const GUEST_API_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search'
const DETAIL_LIMIT = 10
const RESULTS_PER_LOCATION = 25
const POLITE_DELAY_MS = 2000

// Pays couverts par ce scraper (convention multi-pays — voir CLAUDE.md) :
// chaque offre est stampée avec le code ISO correspondant à sa recherche
// d'origine, indépendamment de country: 'BF' par défaut sur BaseScraper.
const LOCATIONS: { country: string; query: string }[] = [
  { country: 'BF', query: 'Burkina Faso' },
  { country: 'BJ', query: 'Bénin' },
]

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Referer': 'https://www.linkedin.com/jobs/search',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function stripTrackingParams(url: string): string {
  const idx = url.indexOf('?')
  return idx === -1 ? url : url.slice(0, idx)
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  country: string
  publishedAt?: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any, country: string): CardData | null {
  const $card = $(card)

  const title = extractText($card.find('.base-search-card__title'))
  if (!title) return null

  const href = $card.find('a.base-card__full-link').first().attr('href') ?? ''
  const sourceUrl = stripTrackingParams(href)
  if (!sourceUrl.startsWith('http')) return null

  const organization = extractText($card.find('.base-search-card__subtitle')) || 'Non précisé'
  const locationText = extractText($card.find('.job-search-card__location'))
  const city = locationText.split(',')[0]?.trim() || locationText || 'Non précisé'

  const datetime = $card.find('time.job-search-card__listdate, time').first().attr('datetime')
  let publishedAt: Date | undefined
  if (datetime) {
    const d = new Date(datetime)
    if (!isNaN(d.getTime())) publishedAt = d
  }

  return { title, sourceUrl, organization, city, country, publishedAt }
}

export class LinkedInScraper extends BaseScraper {
  readonly name = 'linkedin'
  readonly url = `${BASE_URL}/search`
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const cardDataList: CardData[] = []

    for (const location of LOCATIONS) {
      let html = ''
      try {
        info(this.name, `Fetching listing for ${location.query} (${location.country})`)
        const resp = await axios.get(GUEST_API_URL, {
          headers: HTTP_HEADERS,
          timeout: 15_000,
          params: { keywords: '', location: location.query, start: 0 },
        })
        if (resp.status === 200) html = resp.data as string
      } catch (err) {
        const msg = `Listing fetch failed (location=${location.query}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        continue
      }

      if (!html) continue

      const $ = cheerio.load(html)
      const cardEls = $('div.base-card').toArray()

      if (cardEls.length === 0) {
        warn(this.name, `Aucune offre détectée pour ${location.query}. Dump HTML : ${html.slice(0, 500)}`)
        continue
      }

      let added = 0
      for (const el of cardEls) {
        if (added >= RESULTS_PER_LOCATION) break
        const data = extractCardData($, el, location.country)
        if (data && !isLikelyNotJobOffer(data.title, data.sourceUrl)) {
          cardDataList.push(data)
          added++
        }
      }

      await sleep(POLITE_DELAY_MS)
    }

    if (cardDataList.length === 0) {
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await sleep(POLITE_DELAY_MS)

      let description: string | undefined
      let contactEmail: string | undefined
      let contactPhone: string | undefined
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style, nav, header, footer, aside').remove()

        const descText = extractText($d('.description__text, .show-more-less-html__markup'))
        if (descText.length > 50) description = descText.slice(0, 3000)

        const bodyText = descText.length > 50 ? descText : extractText($d('body'))
        contactEmail = extractEmail(bodyText)
        contactPhone = extractPhone(bodyText)

        extracted = await extractWithHaiku(bodyText, card.title, this.name)
      } catch (err) {
        // LinkedIn bloque fréquemment l'accès invité aux fiches détail
        // (redirection login/anti-bot) — on garde l'offre avec les seules
        // données de la carte liste plutôt que de la perdre entièrement.
        const msg = `Failed to fetch detail page ${card.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }

      offers.push({
        title: extracted.title ?? card.title,
        organization: extracted.organization ?? card.organization,
        city: extracted.city ?? card.city,
        country: card.country,
        sector: extracted.sector,
        level: extracted.level,
        contractType: extracted.contractType,
        description: extracted.description ?? description,
        requirements: extracted.requirements,
        contactEmail: extracted.contactEmail ?? contactEmail,
        contactPhone: extracted.contactPhone ?? contactPhone,
        contactAddress: extracted.contactAddress,
        applicationUrl: extracted.applicationUrl ?? card.sourceUrl,
        deadline: parseFlexibleDateText(extracted.deadline),
        publishedAt: card.publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
        sourceUrl: card.sourceUrl,
        isSponsored: extracted.isSponsored,
        isFraudSuspect: extracted.isFraudSuspect,
      })

      info(this.name, `Scraped: "${card.title.slice(0, 60)}" (${card.country})`)
    }

    // Offres restantes au-delà de DETAIL_LIMIT — données de la liste uniquement
    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization,
        city: card.city,
        country: card.country,
        sourceUrl: card.sourceUrl,
        publishedAt: card.publishedAt,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default LinkedInScraper
