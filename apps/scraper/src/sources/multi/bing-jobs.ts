import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../lib/scraper-base'
import { info, warn } from '../../lib/logger'
import { extractEmail, extractPhone } from '../../lib/extractor'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../lib/content-filter'
import { prioritizeUnseen } from '../../lib/pagination'
import { searchJobs, closeBingAgent, BingSearchResult } from '../../lib/bing-grounding'

// Source de découverte transverse — s'appuie sur Grounding with Bing Search
// (Azure AI Foundry Agent) plutôt que sur des sélecteurs par site, pour
// amorcer la couverture de pays sans scraper dédié. Convention multi-pays —
// voir CLAUDE.md : chaque offre est stampée avec le country de sa requête
// d'origine, indépendamment du country par défaut de BaseScraper.
const DETAIL_LIMIT_PER_COUNTRY = 8
const POLITE_DELAY_MS = 1500

const LOCATIONS: { country: string; queries: string[] }[] = [
  { country: 'BJ', queries: ["offres d'emploi Bénin", 'recrutement Cotonou'] },
  { country: 'ML', queries: ["offres d'emploi Mali", 'recrutement Bamako'] },
  { country: 'TG', queries: ["offres d'emploi Togo", 'recrutement Lomé'] },
  { country: 'CI', queries: ["offres d'emploi Côte d'Ivoire", 'recrutement Abidjan'] },
  { country: 'SN', queries: ["offres d'emploi Sénégal", 'recrutement Dakar'] },
  // BF déjà largement couvert par les scrapers directs (bf/jobboard/*) —
  // requête gardée ici en complément, en tant que source de découverte.
  { country: 'BF', queries: ["offres d'emploi Burkina Faso"] },
]

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

interface Candidate {
  sourceUrl: string
  context: string
  country: string
}

export class BingJobsScraper extends BaseScraper {
  readonly name = 'bing-jobs'
  // Source DB unique partagée entre tous les pays, comme linkedin.ts.
  readonly url = 'https://www.bing.com/search?q=emploi'
  readonly sourceType = 'API'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const orderedCandidates: Candidate[] = []

    for (const location of LOCATIONS) {
      const seenUrlsThisCountry = new Set<string>()
      const candidates: Candidate[] = []

      for (const query of location.queries) {
        let results: BingSearchResult[] = []
        try {
          info(this.name, `Searching "${query}" (${location.country})`)
          results = await searchJobs(query)
        } catch (err) {
          const msg = `Search failed (query="${query}"): ${this.handleError(err)}`
          errors.push(msg)
          warn(this.name, msg)
          continue
        }

        for (const result of results) {
          if (seenUrlsThisCountry.has(result.url)) continue
          const pseudoTitle = result.context.slice(0, 120)
          if (isLikelyNotJobOffer(pseudoTitle, result.url)) continue
          seenUrlsThisCountry.add(result.url)
          candidates.push({ sourceUrl: result.url, context: result.context, country: location.country })
        }

        await sleep(POLITE_DELAY_MS)
      }

      if (candidates.length === 0) continue

      // Budget d'extraction Haiku réparti équitablement par pays plutôt que
      // globalement, pour ne pas laisser un pays avec plus de requêtes
      // monopoliser DETAIL_LIMIT_PER_COUNTRY * nombre de pays.
      const ordered = prioritizeUnseen(candidates, c => c.sourceUrl, seenSourceUrls)
      orderedCandidates.push(...ordered.slice(0, DETAIL_LIMIT_PER_COUNTRY))
    }

    // L'agent Bing Grounding n'est plus nécessaire une fois toutes les
    // recherches terminées — le supprimer limite l'accumulation de versions
    // d'agent inutilisées dans le projet Azure AI Foundry.
    await closeBingAgent()

    if (orderedCandidates.length === 0) {
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Fetching detail pages for ${orderedCandidates.length} candidates`)

    for (const candidate of orderedCandidates) {
      await sleep(POLITE_DELAY_MS)

      const fallbackTitle = candidate.context.slice(0, 120) || 'Non précisé'
      let description: string | undefined
      let contactEmail: string | undefined
      let contactPhone: string | undefined
      let pageText = candidate.context

      try {
        const detailResp = await axios.get(candidate.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const $ = cheerio.load(detailResp.data as string)
        $('script, style, nav, header, footer, aside').remove()
        const bodyText = extractText($('body'))
        if (bodyText.length > 50) {
          pageText = bodyText
          description = bodyText.slice(0, 3000)
          contactEmail = extractEmail(bodyText)
          contactPhone = extractPhone(bodyText)
        }
      } catch (err) {
        // Beaucoup de sites référencés par Bing peuvent bloquer le scraping
        // direct — on garde le contexte de l'agent comme repli plutôt que de
        // perdre l'offre, même stratégie de tolérance que linkedin.ts.
        const msg = `Failed to fetch detail page ${candidate.sourceUrl}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }

      const extractedOffers = await extractOffersWithHaiku(pageText, fallbackTitle, this.name)

      if (extractedOffers.length === 0) {
        info(this.name, `Skipped (not a job offer): ${candidate.sourceUrl}`)
        continue
      }

      for (const extracted of extractedOffers) {
        offers.push({
          title: extracted.title ?? fallbackTitle,
          organization: extracted.organization ?? 'Non précisé',
          city: extracted.city ?? 'Non précisé',
          country: candidate.country,
          sector: extracted.sector,
          level: extracted.level,
          contractType: extracted.contractType,
          description: extracted.description ?? description ?? candidate.context,
          requirements: extracted.requirements,
          contactEmail: extracted.contactEmail ?? contactEmail,
          contactPhone: extracted.contactPhone ?? contactPhone,
          contactAddress: extracted.contactAddress,
          applicationUrl: extracted.applicationUrl ?? candidate.sourceUrl,
          deadline: parseFlexibleDateText(extracted.deadline),
          publishedAt: parseFlexibleDateText(extracted.publishedAt),
          sourceUrl: candidate.sourceUrl,
          isSponsored: extracted.isSponsored,
          isFraudSuspect: extracted.isFraudSuspect,
        })
      }

      info(this.name, `Scraped: "${fallbackTitle.slice(0, 60)}" (${candidate.country})`)
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default BingJobsScraper
