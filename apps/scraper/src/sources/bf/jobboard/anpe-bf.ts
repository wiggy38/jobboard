import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// recrutement.anpe.gov.bf est le portail candidat/employeur (Angular, login
// requis) — son endpoint /api/postes/criteria répond 200 avec [] pour tout le
// monde et n'est jamais utilisé par son propre frontend (absent du bundle JS).
// Les offres publiques réelles sont publiées comme articles WordPress sur le
// site vitrine anpe.gov.bf, catégorie "Offres d'emplois" (id 77), dont l'API
// REST expose directement le contenu complet de la fiche — pas besoin de
// fetch de page de détail séparé.
const SITE_URL = 'https://anpe.gov.bf'
const CATEGORY_ID = 77
const LISTING_URL = `${SITE_URL}/wp-json/wp/v2/posts?categories=${CATEGORY_ID}&per_page=30&orderby=date&order=desc`
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

interface WpPost {
  id: number
  date: string
  link: string
  title: { rendered: string }
  content: { rendered: string }
  excerpt: { rendered: string }
}

interface ListingItem {
  title: string
  sourceUrl: string
  publishedAt?: Date
  pageText: string
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style').remove()
  return $.root().text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnpeBfScraper extends BaseScraper {
  readonly name = 'anpe-bf'
  readonly url = LISTING_URL
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    info(this.name, `Fetching listing: ${LISTING_URL}`)

    let posts: WpPost[]
    try {
      const response = await axios.get<WpPost[]>(LISTING_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
      posts = Array.isArray(response.data) ? response.data : []
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `API returned ${posts.length} posts`)

    const listings: ListingItem[] = []
    for (const post of posts) {
      const title = htmlToText(post.title?.rendered ?? '')
      const sourceUrl = post.link
      if (!title || !sourceUrl) continue
      if (isLikelyNotJobOffer(title, sourceUrl)) continue

      const publishedAt = post.date ? new Date(post.date) : undefined
      const pageText = htmlToText(post.content?.rendered ?? post.excerpt?.rendered ?? '')
      listings.push({ title, sourceUrl, publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : undefined, pageText })
    }

    if (listings.length === 0) {
      errors.push('Aucune offre trouvée dans la catégorie "Offres d\'emplois" — vérifier l\'ID de catégorie WordPress')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const extractedOffers = await extractOffersWithHaiku(item.pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}"`)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? 'Non précisé',
            city:           extracted.city          ?? 'Ouagadougou',
            sector:         extracted.sector,
            level:          extracted.level,
            contractType:   extracted.contractType,
            description:    extracted.description,
            requirements:   extracted.requirements,
            contactEmail:   extracted.contactEmail,
            contactPhone:   extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline:       parseFlexibleDateText(extracted.deadline),
            publishedAt:    item.publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
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
        city:         'Ouagadougou',
        publishedAt:  item.publishedAt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default AnpeBfScraper
