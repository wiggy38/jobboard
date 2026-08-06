import axios from 'axios'
import { RawJobOffer, ScraperResult, SETTING_KEYS } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractWithHaiku } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'
import { getSetting } from '../../../lib/settings'

// emploibenin.com et optioncarriere.bj sont tous deux protégés par un
// challenge Cloudflare Turnstile (CAPTCHA) sur toutes leurs pages, y compris
// robots.txt / flux RSS — aucun scraping direct possible. optioncarriere.bj
// appartient au réseau Careerjet, qui expose en échange une API partenaire
// officielle (affiliation gratuite) : on l'utilise ici à la place du HTML.
// Pas de phase Playwright — l'API retourne déjà des résultats structurés
// (titre, organisation, ville, date, url de tracking), donc Phase 1 se
// limite à l'appel HTTP à l'API.
const API_URL = 'http://public.api.careerjet.net/search'
const SITE_URL = 'https://www.optioncarriere.bj'
const REFERER_URL = 'https://tumaa.app/'
const DETAIL_LIMIT = 20
const PAGE_SIZE = 20
const MAX_PAGES = 3
const POLITE_DELAY_MS = 1200

interface CareerjetJob {
  title: string
  locations: string
  company: string
  description: string
  date: string
  url: string
}

interface CareerjetResponse {
  type: string
  hits: number
  pages: number
  jobs: CareerjetJob[]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseCareerjetDate(raw: string): Date | undefined {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

function firstLocationPart(locations: string): string {
  return locations.split(',')[0]?.trim() || 'Non précisé'
}

export class CareerjetBjScraper extends BaseScraper {
  readonly name = 'careerjet-bj'
  readonly url = SITE_URL
  readonly sourceType = 'API'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const affid = await getSetting(SETTING_KEYS.SCRAPER_CAREERJET_AFFID)
    if (!affid) {
      errors.push('CAREERJET_AFFID manquant (à configurer dans /admin/parametres ou .env)')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const jobs: CareerjetJob[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
      info(this.name, `Fetching API page ${page}/${MAX_PAGES}`)
      try {
        const response = await axios.get<CareerjetResponse>(API_URL, {
          params: {
            affid,
            keywords: '',
            location: 'Benin',
            locale_code: 'fr_FR',
            user_ip: '0.0.0.0',
            user_agent: 'Mozilla/5.0 (compatible; TumaaBot/1.0)',
            url: REFERER_URL,
            page,
            pagesize: PAGE_SIZE,
            sort: 'date',
          },
          headers: { Referer: REFERER_URL },
          timeout: 15_000,
        })

        if (response.data.type !== 'JOBS') {
          errors.push(`Réponse API inattendue (type=${response.data.type})`)
          break
        }

        jobs.push(...response.data.jobs)

        if (page >= response.data.pages) break
      } catch (err) {
        const msg = `API fetch failed (page ${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      await sleep(POLITE_DELAY_MS)
    }

    const candidates = jobs.filter(job => job.title && job.url && !isLikelyNotJobOffer(job.title, job.url))

    if (candidates.length === 0) {
      errors.push('Aucune offre exploitable retournée par l\'API Careerjet')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${candidates.length} offres candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, candidates.length)}`)

    const ordered = prioritizeUnseen(candidates, job => job.url, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const job of targets) {
      await sleep(POLITE_DELAY_MS)

      const cardText = `${job.title}\nOrganisation : ${job.company}\nLieu : ${job.locations}\n\n${job.description}`

      try {
        // La description API n'est que l'intro tronquée ("À propos de
        // l'entreprise…"), jamais les missions du poste — le filtre
        // isJobOffer d'extractOffersWithHaiku (calibré sur des pages de
        // détail complètes) la rejette donc à tort dans la quasi-totalité
        // des cas. L'API Careerjet garantit déjà qu'il s'agit d'une offre
        // individuelle réelle : on utilise extractWithHaiku en simple
        // enrichissement (sector/level/contractType), sans re-valider.
        const extracted = await extractWithHaiku(cardText, job.title, this.name)

        const offer: RawJobOffer = {
          title:          extracted.title        ?? job.title,
          organization:   extracted.organization  ?? job.company ?? 'Non précisé',
          city:           extracted.city          ?? firstLocationPart(job.locations),
          country:        this.country,
          sector:         extracted.sector,
          level:          extracted.level,
          contractType:   extracted.contractType,
          description:    extracted.description   ?? job.description,
          requirements:   extracted.requirements,
          contactEmail:   extracted.contactEmail,
          contactPhone:   extracted.contactPhone,
          contactAddress: extracted.contactAddress,
          applicationUrl: extracted.applicationUrl ?? job.url,
          deadline:       undefined,
          publishedAt:    parseCareerjetDate(job.date),
          sourceUrl:      job.url,
          isSponsored:    extracted.isSponsored,
          isFraudSuspect: extracted.isFraudSuspect,
        }

        offers.push(offer)
        info(this.name, `Scraped: "${offer.title.slice(0, 60)}"`)
      } catch (err) {
        const msg = `Failed on ${job.url}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    // Offres restantes au-delà du budget Haiku — données API brutes uniquement
    for (const job of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title:        job.title,
        organization: job.company || 'Non précisé',
        city:         firstLocationPart(job.locations),
        country:      this.country,
        description:  job.description,
        publishedAt:  parseCareerjetDate(job.date),
        sourceUrl:    job.url,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default CareerjetBjScraper
