import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractEmail, extractPhone } from '../../../lib/extractor'
import { extractWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://www.goafricaonline.com'
const LISTING_URL = `${BASE_URL}/bf/emploi`
const LISTING_PAGES = 2
const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 1500

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

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  contractType?: string
  publishedAt?: Date
}

// Le SvelteKit de goafricaonline rend les fiches liste en SSR — la classe
// scopée "svelte-4dndt0" combinée à "border-brand-blue" identifie de façon
// stable chaque carte offre, sans dépendre des classes Tailwind arbitraires
// (gap-[24px]...) qui ne sont pas des sélecteurs CSS valides telles quelles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const titleLink = $card.find('a[class*="grid-area:title"]').first()
  const title = extractText(titleLink)
  if (!title) return null

  const sourceUrl = titleLink.attr('href') ?? ''
  if (!sourceUrl.startsWith('http')) return null

  const organization = extractText($card.find('div[class*="text-16/[20.82px]"]').first()) || 'Non précisé'
  const city = extractText($card.find('img[src*="circle-flags"]').first().next()) || 'Burkina Faso'
  const contractType = extractText($card.find('i[class*="tnp-file-signature"]').first().parent()) || undefined

  return { title, sourceUrl, organization, city, contractType }
}

// Chaque fiche détail embarque un bloc JSON-LD schema.org/JobPosting déjà
// structuré (title, description complète, organisation, ville, secteur,
// dates ISO) — bien plus fiable qu'un parsing CSS. Le HTML de la page
// contient aussi une liste d'offres "similaires" utilisant les mêmes
// classes que la page liste, d'où le choix du JSON-LD plutôt que cheerio ici.
interface JobPostingLd {
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string } }
  industry?: string | string[]
}

function extractJobPostingLd(html: string): JobPostingLd | undefined {
  const rx = /<script type="application\/ld\+json">(.*?)<\/script>/gs
  let match = rx.exec(html)
  while (match) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed?.['@type'] === 'JobPosting') return parsed as JobPostingLd
    } catch {
      // bloc JSON-LD invalide — on continue avec les suivants
    }
    match = rx.exec(html)
  }
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GoAfricaOnlineScraper extends BaseScraper {
  readonly name = 'goafricaonline'
  readonly url = LISTING_URL
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const cardDataList: CardData[] = []
    for (let page = 1; page <= LISTING_PAGES; page++) {
      let html = ''
      try {
        info(this.name, `Fetching listing page ${page}`)
        const resp = await axios.get(LISTING_URL, {
          headers: HTTP_HEADERS,
          timeout: 15_000,
          params: page > 1 ? { page } : undefined,
        })
        if (resp.status === 200) html = resp.data as string
      } catch (err) {
        const msg = `Listing fetch failed (page=${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      if (!html) break

      const $ = cheerio.load(html)
      const cardEls = $('div[class*="border-brand-blue"][class*="svelte-4dndt0"]').toArray()

      if (cardEls.length === 0) {
        if (page === 1) {
          errors.push('Structure HTML non reconnue — intervention manuelle requise')
          warn(this.name, `Aucune offre détectée. Dump HTML : ${html.slice(0, 500)}`)
        }
        break
      }

      for (const el of cardEls) {
        const data = extractCardData($, el)
        if (data && !isLikelyNotJobOffer(data.title, data.sourceUrl)) cardDataList.push(data)
      }

      if (page < LISTING_PAGES) await sleep(POLITE_DELAY_MS)
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
      let organization = card.organization
      let city = card.city
      let sector: string | undefined
      let publishedAt: Date | undefined
      let deadline: Date | undefined
      let contactEmail: string | undefined
      let contactPhone: string | undefined
      let extracted: Awaited<ReturnType<typeof extractWithHaiku>> = {}

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const detailHtml = detailResp.data as string
        const jobPosting = extractJobPostingLd(detailHtml)

        if (jobPosting) {
          description = jobPosting.description
          organization = jobPosting.hiringOrganization?.name || organization
          city = jobPosting.jobLocation?.address?.addressLocality || city
          sector = Array.isArray(jobPosting.industry) ? jobPosting.industry.join(', ') : jobPosting.industry
          publishedAt = parseFlexibleDateText(jobPosting.datePosted)
          deadline = parseFlexibleDateText(jobPosting.validThrough)
        } else {
          warn(this.name, `Pas de bloc JobPosting sur ${card.sourceUrl}`)
        }

        const pageText = description ?? extractText(cheerio.load(detailHtml)('body'))
        contactEmail = extractEmail(pageText)
        contactPhone = extractPhone(pageText)

        extracted = await extractWithHaiku(pageText, card.title, this.name)
      } catch (err) {
        const msg = `Failed to fetch detail page ${card.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }

      offers.push({
        title: extracted.title ?? card.title,
        organization: extracted.organization ?? organization,
        city: extracted.city ?? city,
        country: 'BF',
        sector: extracted.sector ?? sector,
        level: extracted.level,
        contractType: extracted.contractType ?? card.contractType,
        description: extracted.description ?? description?.slice(0, 3000),
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
        country: 'BF',
        contractType: card.contractType,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default GoAfricaOnlineScraper
