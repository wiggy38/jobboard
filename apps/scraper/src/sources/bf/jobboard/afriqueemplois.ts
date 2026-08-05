import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://afriqueemplois.com'
const API_URL = `${BASE_URL}/api/load-more`
// Le domaine racine sert le Burkina Faso par défaut (international=0), sans
// cookie ni session requis — les autres pays sont exposés sous des chemins
// dédiés (/ci, /bj, /tg...) hors périmètre de ce scraper.
const LISTING_PARAMS = { international: '0', status: 'active', category: '' }
const LISTING_PAGES = 3
const HAIKU_LIMIT = 15
const POLITE_DELAY_MS = 800
// Sentinelle utilisée par l'API pour "pas de date limite renseignée".
const NO_DEADLINE_SENTINEL = '2020-01-01'

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

interface ApiPost {
  nid: string
  news_title: string
  news_date: string
  news_description: string
  apply_link_or_email?: string
  category_name?: string
  paysIsoCode?: string
}

interface ApiResponse {
  posts: ApiPost[]
  hasMore: boolean
}

interface ListingItem {
  title: string
  sourceUrl: string
  pageText: string
  deadline?: Date
  country?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style').remove()
  return $.root().text().replace(/\s+/g, ' ').trim()
}

// L'organisation apparaît quasi systématiquement en tête du titre
// ("SOCOGHAF SARL recrute un(e) AGENT GPS") — utilisé uniquement en
// fallback pour les offres au-delà du budget Haiku (pas de fiche extraite).
function guessOrganizationFromTitle(title: string): string {
  const m = title.match(/^(.+?)\s+recrute\b/i)
  return m ? m[1].trim() : 'Non précisé'
}

// contactEmail si adresse mail, applicationUrl si lien, rien si "empty".
function splitApplyField(raw: string | undefined): { contactEmail?: string; applicationUrl?: string } {
  if (!raw || raw === 'empty') return {}
  if (raw.includes('@')) return { contactEmail: raw }
  if (raw.startsWith('http')) return { applicationUrl: raw }
  return {}
}

export class AfriqueEmploisScraper extends BaseScraper {
  readonly name = 'afriqueemplois'
  readonly url = `${BASE_URL}/bf?country=bf`
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const posts: ApiPost[] = []
    for (let page = 1; page <= LISTING_PAGES; page++) {
      try {
        info(this.name, `Fetching listing page ${page}`)
        const resp = await axios.get<ApiResponse>(API_URL, {
          headers: HTTP_HEADERS,
          timeout: 15_000,
          params: { page, ...LISTING_PARAMS },
        })

        const pagePosts = Array.isArray(resp.data?.posts) ? resp.data.posts : []
        posts.push(...pagePosts)

        if (!resp.data?.hasMore || pagePosts.length === 0) break
      } catch (err) {
        const msg = `Listing fetch failed (page=${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      if (page < LISTING_PAGES) await sleep(POLITE_DELAY_MS)
    }

    if (posts.length === 0) {
      errors.push('Aucune offre trouvée — vérifier /api/load-more')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `API returned ${posts.length} posts`)

    const listings: ListingItem[] = []
    for (const post of posts) {
      const title = htmlToText(post.news_title ?? '')
      const sourceUrl = `${BASE_URL}/post/${post.nid}`
      if (!title || !post.nid) continue
      if (isLikelyNotJobOffer(title, sourceUrl)) continue

      const deadline = post.news_date && post.news_date !== NO_DEADLINE_SENTINEL
        ? parseFlexibleDateText(post.news_date)
        : undefined

      listings.push({
        title,
        sourceUrl,
        pageText: htmlToText(post.news_description ?? ''),
        deadline,
        country: post.paysIsoCode,
      })
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(HAIKU_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, HAIKU_LIMIT)
    const applyByUrl = new Map(posts.map(p => [`${BASE_URL}/post/${p.nid}`, p.apply_link_or_email]))

    for (const item of targets) {
      try {
        const extractedOffers = await extractOffersWithHaiku(item.pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        const { contactEmail, applicationUrl } = splitApplyField(applyByUrl.get(item.sourceUrl))

        for (const extracted of extractedOffers) {
          offers.push({
            title: extracted.title ?? item.title,
            organization: extracted.organization ?? 'Non précisé',
            city: extracted.city ?? 'Burkina Faso',
            country: item.country,
            sector: extracted.sector,
            level: extracted.level,
            contractType: extracted.contractType,
            description: extracted.description,
            requirements: extracted.requirements,
            contactEmail: extracted.contactEmail ?? contactEmail,
            contactPhone: extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl ?? applicationUrl,
            deadline: parseFlexibleDateText(extracted.deadline) ?? item.deadline,
            publishedAt: parseFlexibleDateText(extracted.publishedAt),
            sourceUrl: item.sourceUrl,
            isSponsored: extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          })

          info(this.name, `Scraped: "${item.title.slice(0, 60)}"`)
        }
      } catch (err) {
        const msg = `Failed on ${item.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    // Offres restantes au-delà du budget Haiku — données de liste uniquement
    for (const item of ordered.slice(HAIKU_LIMIT)) {
      offers.push({
        title: item.title,
        organization: guessOrganizationFromTitle(item.title),
        city: 'Burkina Faso',
        country: item.country,
        deadline: item.deadline,
        sourceUrl: item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default AfriqueEmploisScraper
