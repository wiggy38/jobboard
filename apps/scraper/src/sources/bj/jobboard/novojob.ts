import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Novojob expose un vrai flux RSS (/benin/rss) qui sert de découverte de
// listing — plus fiable qu'un scraping de la page HTML — mais sa description
// est tronquée par le flux lui-même (finit toujours par "..."). La fiche
// détail, elle, embarque un <script type="application/ld+json"> JobPosting
// (schema.org) complet : description intégrale, organisation, localisation,
// dates, niveau d'études — on parse ce JSON-LD plutôt que le HTML visible,
// résistant aux refontes de mise en page.
const BASE_URL = 'https://www.novojob.com'
const RSS_URL = `${BASE_URL}/benin/rss`
const SITE_URL = `${BASE_URL}/benin/offres-d-emploi`
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

interface ListingItem {
  title: string
  sourceUrl: string
}

interface JobPostingLd {
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string | null; addressCountry?: string } }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchListing(): Promise<ListingItem[]> {
  const response = await axios.get<string>(RSS_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data, { xmlMode: true })

  const items: ListingItem[] = []
  $('item').each((_i, el) => {
    const $item = $(el)
    const title = $item.find('title').first().text().trim()
    const sourceUrl = $item.find('link').first().text().trim()
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    items.push({ title, sourceUrl })
  })

  return items
}

function extractJobPostingLd(html: string): JobPostingLd | undefined {
  const $ = cheerio.load(html)
  let parsed: JobPostingLd | undefined

  $('script[type="application/ld+json"]').each((_i, el) => {
    if (parsed) return
    try {
      const json = JSON.parse($(el).contents().text())
      if (json && json['@type'] === 'JobPosting') parsed = json as JobPostingLd
    } catch {
      // ignore : bloc JSON-LD malformé ou non pertinent
    }
  })

  return parsed
}

export class NovojobScraper extends BaseScraper {
  readonly name = 'novojob'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    let listings: ListingItem[] = []
    try {
      listings = await fetchListing()
    } catch (err) {
      const msg = `RSS fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable détectée — flux RSS vide ou structure modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates via RSS, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResponse = await axios.get<string>(item.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const jobPosting = extractJobPostingLd(detailResponse.data)

        if (!jobPosting?.description) {
          warn(this.name, `Pas de JSON-LD JobPosting exploitable : ${item.sourceUrl}`)
          continue
        }

        const pageText = cheerio.load(jobPosting.description)('body').text().replace(/\s+/g, ' ').trim()
        const extractedOffers = await extractOffersWithHaiku(pageText, jobPosting.title ?? item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? jobPosting.title ?? item.title,
            organization:   extracted.organization  ?? jobPosting.hiringOrganization?.name ?? 'Non précisé',
            city:           extracted.city          ?? jobPosting.jobLocation?.address?.addressLocality ?? 'Bénin',
            country:        this.country,
            sector:         extracted.sector,
            level:          extracted.level,
            contractType:   extracted.contractType,
            description:    extracted.description,
            requirements:   extracted.requirements,
            contactEmail:   extracted.contactEmail,
            contactPhone:   extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline:       parseFlexibleDateText(extracted.deadline) ?? parseFlexibleDateText(jobPosting.validThrough),
            publishedAt:    parseFlexibleDateText(extracted.publishedAt) ?? parseFlexibleDateText(jobPosting.datePosted),
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
        organization: 'Non précisé',
        city:         'Bénin',
        country:      this.country,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default NovojobScraper
