import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing statique sur une seule page (pas de pagination observée, ~17
// annonces au moment de l'écriture), pas d'API ni de flux RSS. Cartes en
// "div.div_rz_ance_gnral" : titre dans ".ance_titre", puis 4 liens
// "a.ss_miz_f" dans un ordre fixe (recruteur, lieu, type de contrat,
// secteur) — plus fiable que de dépendre des icônes FontAwesome voisines.
const BASE_URL = 'https://www.bjemploi.com'
const SITE_URL = `${BASE_URL}/emplois-annonces.html`
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
  organization?: string
  city?: string
  contractType?: string
  sector?: string
  deadline?: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveUrl(href: string): string {
  return href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`
}

// Dates de clôture au format "DD-MM-YYYY" affichées en gras dans la carte.
function parseListingDeadline(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const match = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
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
  return 'AUTRE'
}

async function fetchListingPage(): Promise<ListingItem[]> {
  const response = await axios.get<string>(SITE_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
  const $ = cheerio.load(response.data)

  const items: ListingItem[] = []
  $('.div_rz_ance_gnral').each((_i, el) => {
    const $card = $(el)
    const $titleLink = $card.find('.ance_titre').first().parent('a')
    const title = extractText($card.find('.ance_titre').first())
    const href = $titleLink.attr('href') ?? ''
    if (!title || !href) return
    const sourceUrl = resolveUrl(href)
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    const infoLinks = $card.find('a.ss_miz_f')
    const organization = extractText(infoLinks.eq(0)) || undefined
    const city = extractText(infoLinks.eq(1)) || undefined
    const contractType = mapContractType(extractText(infoLinks.eq(2)))
    const sector = extractText(infoLinks.eq(3)) || undefined
    const deadlineText = extractText($card.find('td').last().find('b').first())

    items.push({ title, sourceUrl, organization, city, contractType, sector, deadline: parseListingDeadline(deadlineText) })
  })

  return items
}

export class BjEmploiScraper extends BaseScraper {
  readonly name = 'bjemploi'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    let listings: ListingItem[] = []
    try {
      listings = await fetchListingPage()
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable détectée — catalogue vide ou structure HTML modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResponse = await axios.get<string>(item.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        const d$ = cheerio.load(detailResponse.data)
        d$('script, style, nav, header, footer').remove()
        const pageText = extractText(d$('#contenu_ance'))

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
            publishedAt:    parseFlexibleDateText(extracted.publishedAt),
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
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default BjEmploiScraper
