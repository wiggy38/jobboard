import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://professionnallink.com'
const LISTING_API = `${BASE_URL}/api/jobs.php`
// Filtre serveur "pays" — valeur de l'option "Burkina Faso" du sélecteur, lue
// depuis /api/job-filters.php. Le site couvre des centaines de pays ; on ne
// scrape que le Burkina Faso ici (cohérent avec BaseScraper.country = 'BF').
const PAYS_BURKINA_FASO = '23'
const LISTING_PAGE_SIZE = 12
const LISTING_PAGES = 2
const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

interface CardData {
  title: string
  sourceUrl: string
  organization: string
  city: string
  sector?: string
  publishedAt?: Date
  deadline?: Date
}

interface JsonLdJobPosting {
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } }
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

// Les cartes utilisent DD-MM-YYYY partout ("Limite : 23-07-2026", "Publiée le 17-07-2026").
function parseDashDate(raw: string): Date | undefined {
  const m = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (!m) return undefined
  const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCardData($: cheerio.CheerioAPI, card: any): CardData | null {
  const $card = $(card)

  const titleLink = $card.find('a.pl-offer-title').first()
  const title = extractText(titleLink)
  const href = titleLink.attr('href') ?? ''
  const sourceUrl = toAbsUrl(href)
  if (!title || !sourceUrl) return null

  const organization = extractText($card.find('.pl-offer-company a').first()) || 'Non précisé'

  const tagLinks = $card.find('.pl-offer-tags a').toArray()
  let city = 'Burkina Faso'
  let sector: string | undefined
  for (const tag of tagLinks) {
    const $tag = $(tag)
    const tagHref = $tag.attr('href') ?? ''
    if (tagHref.includes('/emplois/ville/')) city = extractText($tag) || city
    else if (tagHref.includes('/emplois/secteur/')) sector = extractText($tag) || sector
  }

  const deadlineText = extractText($card.find('.pl-offer-deadline'))
  const dateText = extractText($card.find('.pl-offer-date'))
  const deadline = parseDashDate(deadlineText)
  const publishedAt = parseDashDate(dateText)

  return { title, sourceUrl, organization, city, sector, publishedAt, deadline }
}

export class ProfessionnallinkScraper extends BaseScraper {
  readonly name = 'professionnallink'
  readonly url = `${BASE_URL}/recherche-des-offres-d-emplois-du-jour/`
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const cardDataList: CardData[] = []
    for (let page = 0; page < LISTING_PAGES; page++) {
      const start = page * LISTING_PAGE_SIZE
      try {
        info(this.name, `Fetching listing: start=${start} limit=${LISTING_PAGE_SIZE}`)
        const resp = await axios.post(
          LISTING_API,
          new URLSearchParams({
            secteur: '',
            pays: PAYS_BURKINA_FASO,
            niveauetude: '',
            entreprise: '',
            textrech: '',
            start: String(start),
            limit: String(LISTING_PAGE_SIZE),
            format: 'json',
          }),
          { headers: HTTP_HEADERS, timeout: 15_000 }
        )

        const html: string = resp.data?.html ?? ''
        if (!html) break

        const $ = cheerio.load(html)
        const cardEls = $('article.pl-offer-card').toArray()
        for (const el of cardEls) {
          const data = extractCardData($, el)
          if (data && !isLikelyNotJobOffer(data.title, data.sourceUrl)) cardDataList.push(data)
        }

        if (!resp.data?.hasMore) break
      } catch (err) {
        const msg = `Listing fetch failed (start=${start}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }
    }

    if (cardDataList.length === 0) {
      errors.push('Aucune offre trouvée — vérifier l\'API /api/jobs.php ou le filtre pays')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Extracted ${cardDataList.length} valid cards, fetching up to ${DETAIL_LIMIT} detail pages`)

    const ordered = prioritizeUnseen(cardDataList, card => card.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const card of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResp = await axios.get(card.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $d = cheerio.load(detailResp.data as string)

        // La page expose un bloc JobPosting schema.org avec le texte complet
        // de l'annonce déjà aplati — plus fiable qu'un sélecteur CSS sur
        // .pl-job-description (mise en forme fragile avec des <br/>).
        const ldJsonRaw = $d('script[type="application/ld+json"]').first().html() ?? ''
        let jobPosting: JsonLdJobPosting = {}
        try {
          jobPosting = ldJsonRaw ? JSON.parse(ldJsonRaw) : {}
        } catch {
          // JSON-LD absent ou invalide — on retombe sur les seules données de carte
        }

        const pageText = jobPosting.description ?? extractText($d('.pl-job-description'))
        if (!pageText) {
          errors.push(`Pas de contenu extractible sur ${card.sourceUrl}`)
          continue
        }

        const extractedOffers = await extractOffersWithHaiku(pageText, card.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${card.title.slice(0, 60)}" — ${card.sourceUrl}`)
          rejectedNotJobOffer.push(card.sourceUrl)
          continue
        }

        const publishedAt = card.publishedAt ?? parseFlexibleDateText(jobPosting.datePosted)
        const deadline = card.deadline ?? parseFlexibleDateText(jobPosting.validThrough)

        for (const extracted of extractedOffers) {
          offers.push({
            title: extracted.title ?? card.title,
            organization: extracted.organization ?? jobPosting.hiringOrganization?.name ?? card.organization,
            city: extracted.city ?? jobPosting.jobLocation?.address?.addressLocality ?? card.city,
            sector: extracted.sector ?? card.sector,
            level: extracted.level,
            contractType: extracted.contractType,
            description: extracted.description,
            requirements: extracted.requirements,
            contactEmail: extracted.contactEmail,
            contactPhone: extracted.contactPhone,
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
      } catch (err) {
        const msg = `Failed on ${card.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    // Offres restantes au-delà de DETAIL_LIMIT — données de la liste uniquement
    for (const card of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title: card.title,
        organization: card.organization,
        city: card.city,
        sector: card.sector,
        publishedAt: card.publishedAt,
        deadline: card.deadline,
        sourceUrl: card.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default ProfessionnallinkScraper
