import axios from 'axios'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Application React (SPA) sans rendu serveur, mais qui expose directement
// l'API JSON qu'elle consomme elle-même (pas de clé, pas d'auth) : la liste
// via get_jobs_list.php (pagination page/per_page) et la fiche complète via
// index.php?key=get_job_details, dont le champ "infos_descriptives" contient
// déjà le texte intégral de l'offre — Playwright inutile ici.
const BASE_URL = 'https://www.wabajob.com'
const LIST_API_URL = `${BASE_URL}/src/pages/fichier_web/api/get_jobs_list.php`
const DETAIL_API_URL = `${BASE_URL}/src/pages/fichier_web/api/index.php`
const PER_PAGE = 20
const MAX_PAGES = 5
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

interface WabajobListItem {
  id: number
  titre: string
  nom: string
  lieu: string
  contrat?: string
  domaine?: string
  date_cloture?: string
  date_creation?: string
}

interface WabajobDetail {
  id: number
  infos_descriptives?: string
}

interface ListingItem {
  title: string
  sourceUrl: string
  organization?: string
  city?: string
  contractType?: string
  sector?: string
  deadline?: Date
  publishedAt?: Date
  detailApiUrl: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Dates au format "DD/MM/YYYY".
function parseSlashDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return undefined
  const d = new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10))
  return isNaN(d.getTime()) ? undefined : d
}

function mapContractType(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower.includes('indéterminée') || lower.includes('cdi')) return 'CDI'
  if (lower.includes('déterminée') || lower.includes('cdd')) return 'CDD'
  if (lower.includes('stage')) return 'STAGE'
  if (lower.includes('alternance')) return 'ALTERNANCE'
  if (lower.includes('freelance') || lower.includes('consultant')) return 'FREELANCE'
  if (lower.includes('bénévol')) return 'BENEVOLE'
  if (lower.includes('tout type')) return undefined
  return 'AUTRE'
}

async function fetchListingPage(page: number): Promise<ListingItem[]> {
  const response = await axios.get<{ data: WabajobListItem[] }>(LIST_API_URL, {
    headers: HTTP_HEADERS,
    params: { page, per_page: PER_PAGE, tri: 'recent' },
    timeout: 15_000,
  })

  return (response.data.data ?? []).map(item => ({
    title: item.titre,
    sourceUrl: `${BASE_URL}/entreprise/offre/${item.id}`,
    organization: item.nom || undefined,
    city: item.lieu || undefined,
    contractType: mapContractType(item.contrat),
    sector: item.domaine || undefined,
    deadline: parseSlashDate(item.date_cloture),
    publishedAt: parseSlashDate(item.date_creation),
    detailApiUrl: `${DETAIL_API_URL}?id=${item.id}&compte=entreprise&key=get_job_details`,
  }))
}

export class WabajobScraper extends BaseScraper {
  readonly name = 'wabajob'
  readonly url = `${BASE_URL}/offres`
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const listings: ListingItem[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const items = await fetchListingPage(page)
        if (items.length === 0) break
        listings.push(...items.filter(item => !isLikelyNotJobOffer(item.title, item.sourceUrl)))
      } catch (err) {
        const msg = `Listing fetch failed (page ${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }

      if (page < MAX_PAGES) await sleep(POLITE_DELAY_MS)
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable détectée — catalogue vide ou structure API modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResponse = await axios.get<WabajobDetail[]>(item.detailApiUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const pageText = detailResponse.data?.[0]?.infos_descriptives ?? ''

        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? item.organization ?? 'Non précisé',
            city:           extracted.city          ?? item.city ?? 'Bénin',
            country:        this.country,
            sector:         extracted.sector        ?? item.sector,
            level:          extracted.level,
            contractType:   extracted.contractType   ?? item.contractType,
            description:    extracted.description,
            requirements:   extracted.requirements,
            contactEmail:   extracted.contactEmail,
            contactPhone:   extracted.contactPhone,
            contactAddress: extracted.contactAddress,
            applicationUrl: extracted.applicationUrl,
            deadline:       parseFlexibleDateText(extracted.deadline) ?? item.deadline,
            publishedAt:    parseFlexibleDateText(extracted.publishedAt) ?? item.publishedAt,
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
        organization: item.organization ?? 'Non précisé',
        city:         item.city ?? 'Bénin',
        country:      this.country,
        sector:       item.sector,
        contractType: item.contractType,
        deadline:     item.deadline,
        publishedAt:  item.publishedAt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default WabajobScraper
