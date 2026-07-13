import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const DETAIL_LIMIT = 10
const POLITE_DELAY_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseDate(raw: string): Date | undefined {
  // SPIP typically outputs dates like "12 juin 2024" or "12/06/2024"
  const cleaned = raw.trim()
  const parsed = new Date(cleaned)
  if (!isNaN(parsed.getTime())) return parsed

  // French month names
  const MONTHS: Record<string, number> = {
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
  }
  const match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (match) {
    const day = parseInt(match[1], 10)
    const month = MONTHS[match[2].toLowerCase()]
    const year = parseInt(match[3], 10)
    if (month !== undefined) return new Date(year, month, day)
  }
  return undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}


export class LefasoScraper extends BaseScraper {
  readonly name = 'lefaso'
  readonly url = 'https://lefaso.net/spip.php?rubrique217'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    info(this.name, `Fetching listing: ${this.url}`)

    let html: string
    try {
      const response = await axios.get(this.url, {
        timeout: 15_000,
        headers: { 'User-Agent': 'TumaaBot/1.0 (+https://tumaa.bf)' },
      })
      html = response.data as string
    } catch (err) {
      const msg = `Failed to fetch listing page: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const $ = cheerio.load(html)

    // SPIP rubrique pages list articles with various possible structures
    type ListingItem = { title: string; link: string; publishedAt?: Date }
    const listings: ListingItem[] = []

    // Try several common SPIP/Lefaso selectors
    const selectors = [
      'article h3 a',
      'article h2 a',
      '.article h3 a',
      '.article h2 a',
      'h3.titre_article a',
      'h3 a',
      'h2 a',
    ]

    for (const sel of selectors) {
      $(sel).each((_i, el) => {
        const a = $(el)
        const title = extractText(a)
        const href = a.attr('href') ?? ''
        if (title && href) {
          const absLink = href.startsWith('http') ? href : `https://lefaso.net/${href.replace(/^\//, '')}`
          listings.push({ title, link: absLink })
        }
      })
      if (listings.length > 0) break
    }

    if (listings.length === 0) {
      errors.push('Could not find any article links on the listing page — HTML structure may have changed')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Found ${listings.length} articles on listing page`)

    // Pré-filtre : pages de contact, mentions légales, listicles, agrégats...
    const filteredListings = listings.filter(item => !isLikelyNotJobOffer(item.title, item.link))

    // Offres jamais vues priorisées (top N, budget réparti sur plusieurs runs)
    const ordered = prioritizeUnseen(filteredListings, item => item.link, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailHtml = await axios.get(item.link, {
          timeout: 15_000,
          headers: { 'User-Agent': 'TumaaBot/1.0 (+https://tumaa.bf)' },
        })
        const d$ = cheerio.load(detailHtml.data as string)
        d$('script, style, nav, header, footer, [class*="menu"], [class*="sidebar"]').remove()

        // Extract description — try common SPIP article body selectors
        const bodySelectors = ['#article .texte', '.texte', 'article .article-body', '.article-content', '.contenu']
        let description = ''
        for (const s of bodySelectors) {
          const txt = extractText(d$(s))
          if (txt.length > 50) { description = txt; break }
        }
        if (!description) {
          description = extractText(d$('article')) || extractText(d$('main'))
        }

        // Organisation — often appears after "Organisation :" or "Recruteur :"
        let organization = ''
        const orgRegex = /(?:organisation|recruteur|employeur|structure|institution)\s*:?\s*([^\n,;]{3,80})/i
        const orgMatch = description.match(orgRegex)
        if (orgMatch) organization = orgMatch[1].trim()
        if (!organization) {
          // Try meta or subtitle
          organization = extractText(d$('.organisation, .structure, .recruteur, .surtitre')).slice(0, 80)
        }

        // City
        let city = 'Ouagadougou' // default for Burkina Faso jobs
        const cityRegex = /(?:lieu|ville|localisation|poste basé)\s*:?\s*([^\n,;]{3,50})/i
        const cityMatch = description.match(cityRegex)
        if (cityMatch) city = cityMatch[1].trim()

        // Contact email
        let contactEmail: string | undefined
        const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
        if (emailMatch) contactEmail = emailMatch[0]

        // Deadline — look for "Date limite" or "Clôture"
        let deadline: Date | undefined
        const dlRegex = /(?:date limite|clôture|dépôt des dossiers|avant le|deadline)\s*:?\s*([\d/\s\w]+)/i
        const dlMatch = description.match(dlRegex)
        if (dlMatch) deadline = parseDate(dlMatch[1])

        // Published date — try page meta or listing item
        let publishedAt = item.publishedAt
        if (!publishedAt) {
          const dateText = extractText(d$('[class*="date"], .date_pub, .date, time'))
          if (dateText) publishedAt = parseDate(dateText)
        }

        // ── Haiku extrait/complète les champs structurés depuis le texte brut ──
        // Une fiche peut décrire plusieurs postes distincts dans un seul
        // article SPIP — extractOffersWithHaiku retourne alors un élément par
        // poste, tous partageant le même sourceUrl (le hash de dédup inclut
        // le titre, donc pas de collision).
        const pageText = extractText(d$('body')).replace(/\s{3,}/g, '\n')
        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}"`)
          continue
        }

        for (const extracted of extractedOffers) {
          const raw: RawJobOffer = {
            title: extracted.title ?? item.title,
            organization: extracted.organization ?? (organization || 'Non précisé'),
            city: extracted.city ?? city,
            sector: extracted.sector,
            level: extracted.level,
            contractType: extracted.contractType,
            description: extracted.description ?? description.slice(0, 3000),
            requirements: extracted.requirements,
            contactEmail: extracted.contactEmail ?? contactEmail,
            contactPhone: extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline: parseFlexibleDateText(extracted.deadline) ?? deadline,
            publishedAt: publishedAt ?? parseFlexibleDateText(extracted.publishedAt),
            sourceUrl: item.link,
            isSponsored: extracted.isSponsored,
            isFraudSuspect: extracted.isFraudSuspect,
          }

          offers.push(raw)
          info(this.name, `Scraped: "${raw.title.slice(0, 60)}"`)
        }
      } catch (err) {
        const msg = `Failed to scrape ${item.link}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default LefasoScraper
