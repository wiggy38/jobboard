import axios from 'axios'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { extractTextFromPdfUrl } from '../../../lib/pdf-extractor'
import { prioritizeUnseen } from '../../../lib/pagination'

// Portail officiel ANPE Bénin (SIC@) : SPA Vue sans contenu HTML exploitable,
// mais son CSP (header connect-src) expose une vraie API JSON publique et
// sans authentification sur sica-api.anpe.bj — pas besoin de Playwright.
// /api/offres/published (offres internes ANPE, ~6) n'expose ni organisation
// ni description exploitable (masquage volontaire côté "service délégué") :
// inutilisable pour respecter la règle "contacts toujours visibles".
// /api/offresExternes/published (annonces d'entreprises tierces, ~250+)
// expose une "entreprise" nommée, mais le contenu réel (missions, contacts,
// ville) est systématiquement dans un PDF joint (fullPhotoUrl) plutôt que
// dans un champ texte de l'API — d'où le passage par pdf-extractor.ts avant
// Phase 2 (Haiku), au lieu d'un simple nettoyage de HTML.
const API_BASE = 'https://sica-api.anpe.bj/api'
const LISTING_URL = `${API_BASE}/offresExternes/published`
const PORTAL_URL = 'https://sica.anpe.bj/portail-offres'
const PAGE_SIZE = 50
const MAX_PAGES = 8
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

// sica-api.anpe.bj renvoie un en-tête Content-Security-Policy dupliqué et
// replié (obsolete line folding, RFC 7230) que le parseur HTTP strict de
// Node (llhttp) rejette avec HPE_INVALID_HEADER_TOKEN — curl et les
// navigateurs le tolèrent sans problème, donc ce n'est visible qu'ici.
const AXIOS_CONFIG = { timeout: 15_000, insecureHTTPParser: true }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface AnpeNiveau {
  code?: string
}

interface AnpeNature {
  code?: string
}

interface AnpeOffreExterne {
  id: number
  intitule?: string
  entreprise?: string
  lieu?: string | null
  dateCloture?: string | null
  dateDebutPub?: string | null
  nature?: AnpeNature | null
  niveaus?: AnpeNiveau[]
  fullPhotoUrl?: string
  typeFichier?: string
}

interface AnpePage {
  content: AnpeOffreExterne[]
  totalPages: number
  last: boolean
}

interface ListingItem {
  id: number
  title: string
  organization: string
  sourceUrl: string
  contractType?: string
  level?: string
  deadline?: Date
  publishedAt?: Date
}

// "BAC+5/Master" -> "BAC+5" ; "Doctorat" / "Non précisé" inchangés — simple
// filet de secours si Haiku n'extrait rien du PDF, valeurs canoniques
// définies dans ai-extractor.ts (EXTRACTION_SYSTEM).
function normalizeLevelCode(code: string | undefined): string | undefined {
  if (!code) return undefined
  return code.split('/')[0].trim()
}

async function fetchListingPage(page: number): Promise<AnpePage> {
  const response = await axios.get<AnpePage>(LISTING_URL, {
    ...AXIOS_CONFIG,
    params: { page, size: PAGE_SIZE },
  })
  return response.data
}

export class AnpeBjScraper extends BaseScraper {
  readonly name = 'anpe-bj'
  readonly url = PORTAL_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const listings: ListingItem[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      info(this.name, `Fetching API page ${page + 1}/${MAX_PAGES}`)
      try {
        const data = await fetchListingPage(page)

        for (const item of data.content) {
          if (item.typeFichier !== 'pdf' || !item.fullPhotoUrl || !item.intitule) continue

          listings.push({
            id: item.id,
            title: item.intitule.trim(),
            organization: item.entreprise?.trim() || 'Non précisé',
            sourceUrl: item.fullPhotoUrl,
            contractType: item.nature?.code,
            level: normalizeLevelCode(item.niveaus?.[0]?.code),
            deadline: item.dateCloture ? parseFlexibleDateText(item.dateCloture) : undefined,
            publishedAt: item.dateDebutPub ? parseFlexibleDateText(item.dateDebutPub) : undefined,
          })
        }

        if (data.last || page + 1 >= data.totalPages) break
      } catch (err) {
        const msg = `Listing fetch failed (page ${page}): ${this.handleError(err)}`
        errors.push(msg)
        warn(this.name, msg)
        break
      }
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable détectée — API vide ou structure JSON modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const pdfText = await extractTextFromPdfUrl(item.sourceUrl)
        if (!pdfText.trim()) {
          warn(this.name, `PDF vide ou illisible : ${item.sourceUrl}`)
          continue
        }

        const extractedOffers = await extractOffersWithHaiku(pdfText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? item.organization,
            city:           extracted.city          ?? 'Bénin',
            country:        this.country,
            sector:         extracted.sector,
            level:          extracted.level          ?? item.level,
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

    // Offres restantes au-delà du budget Haiku — pas de description sans
    // avoir lu le PDF, mais on garde le nécessaire pour la dédup/le suivi.
    for (const item of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title:        item.title,
        organization: item.organization,
        city:         'Bénin',
        country:      this.country,
        contractType: item.contractType,
        level:        item.level,
        deadline:     item.deadline,
        publishedAt:  item.publishedAt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default AnpeBjScraper
