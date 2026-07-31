import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractEmail, extractPhone } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://www.ici-pe.com'
const LISTING_URL = `${BASE_URL}/jobs/`
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`
const DETAIL_LIMIT = 10
const LISTING_PER_PAGE = 20
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function stripCountrySuffix(location: string): string {
  // "Ouagadougou (BURKINA FASO)" → "Ouagadougou"
  return location.replace(/\([^)]*\)/g, '').trim() || location
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  contractType?: string
  publishedAt?: Date
}

// Le listing ici-pe.com (plugin WP Job Manager) est chargé en AJAX — le HTML
// de https://www.ici-pe.com/jobs/ ne contient qu'un conteneur vide
// <ul class="job_listings">. Le même wp-admin/admin-ajax.php?action=
// job_manager_get_listings que le thème appelle en JS renvoie directement le
// HTML des <li class="job_listing"> à parser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const title = extractText($card.find('h3'))
  if (!title) return null

  const href = $card.find('a').first().attr('href') ?? ''
  const sourceUrl = href.startsWith('http') ? href : ''
  if (!sourceUrl) return null

  const organization = extractText($card.find('.company')) || 'Non précisé'
  const rawLocation = extractText($card.find('.location')) || 'Burkina Faso'
  const city = stripCountrySuffix(rawLocation)
  const contractType = extractText($card.find('.job-type')) || undefined

  const dateAttr = $card.find('time').first().attr('datetime')
  const publishedAt = dateAttr ? new Date(dateAttr) : undefined

  return {
    title,
    sourceUrl,
    organization,
    city,
    contractType,
    publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined,
  }
}

export class IciPeScraper extends BaseScraper {
  readonly name = 'icipe'
  readonly url = LISTING_URL

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    let listingHtml = ''
    try {
      info(this.name, `Fetching listing via AJAX: ${AJAX_URL}`)
      const resp = await axios.post(
        AJAX_URL,
        new URLSearchParams({
          action: 'job_manager_get_listings',
          search_location: '',
          search_keywords: '',
          per_page: String(LISTING_PER_PAGE),
          orderby: 'featured',
          order: 'DESC',
          page: '1',
        }),
        { headers: HTTP_HEADERS, timeout: 15_000 }
      )
      listingHtml = resp.data?.html ?? ''
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      warn(this.name, msg)
    }

    if (!listingHtml) {
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const $ = cheerio.load(listingHtml)
    const cardEls = $('li.job_listing').toArray()

    if (cardEls.length === 0) {
      errors.push('Structure HTML non reconnue — intervention manuelle requise')
      warn(this.name, `Aucune offre détectée. Dump HTML : ${listingHtml.slice(0, 500)}`)
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
      const publishedAt = card.publishedAt
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)
        $d('script, style, nav, header, footer, aside').remove()

        const descText = extractText($d('.job_description'))
        if (descText.length > 50) description = descText.slice(0, 3000)

        const bodyText = extractText($d('.single_job_listing'))
        contactEmail = extractEmail(bodyText)
        contactPhone = extractPhone(bodyText)

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
        sector: extracted.sector,
        contractType: extracted.contractType ?? card.contractType,
        description: extracted.description ?? description,
        requirements: extracted.requirements,
        contactEmail: extracted.contactEmail ?? contactEmail,
        contactPhone: extracted.contactPhone ?? contactPhone,
        contactAddress: extracted.contactAddress,
        applicationUrl: extracted.applicationUrl,
        deadline: parseFlexibleDateText(extracted.deadline),
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
        contractType: card.contractType,
        publishedAt: card.publishedAt,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default IciPeScraper
