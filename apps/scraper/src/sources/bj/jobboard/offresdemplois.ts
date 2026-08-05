import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// offresdemplois.bj expose la liste complète des offres sur sa page d'accueil
// (pas de pagination publique — "Voir plus" pointe vers /connexion), mais
// TOUTES les fiches détail (/liste_details/:id) redirigent un visiteur non
// authentifié vers /login : aucun contenu de fiche (organisation,
// description, contacts) n'est accessible sans compte. On ne dispose donc
// que des champs visibles sur la carte de liste (titre, pays, date de
// publication, date limite de dépôt) — Phase 2 (Haiku) s'exécute quand même
// sur ce texte réduit pour normaliser le titre et déduire un secteur, comme
// pour les extraits de recherche dans multi/bing-jobs.ts.
const SITE_URL = 'https://www.offresdemplois.bj'
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
  publishedAt?: Date
  deadline?: Date
  cardText: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class OffresdemploisBjScraper extends BaseScraper {
  readonly name = 'offresdemplois-bj'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    info(this.name, `Fetching listing: ${SITE_URL}`)

    let html = ''
    try {
      const response = await axios.get<string>(SITE_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
      html = response.data
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const $ = cheerio.load(html)
    const cardEls = $('.jbs-grid-usrs-block').toArray()

    if (cardEls.length === 0) {
      errors.push('Aucune carte offre détectée — structure HTML probablement modifiée')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const listings: ListingItem[] = []
    for (const el of cardEls) {
      const $card = $(el)
      const title = extractText($card.find('h6').first())
      const sourceUrl = $card.find('a[href*="/liste_details/"]').first().attr('href') ?? ''
      if (!title || !sourceUrl) continue
      if (isLikelyNotJobOffer(title, sourceUrl)) continue

      const cardText = extractText($card)
      const publishedMatch = cardText.match(/Publier le\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
      const deadlineMatch = cardText.match(/D[ée]p[oô]t de dossier\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)

      listings.push({
        title,
        sourceUrl,
        publishedAt: parseFlexibleDateText(publishedMatch?.[1]),
        deadline: parseFlexibleDateText(deadlineMatch?.[1]),
        cardText,
      })
    }

    if (listings.length === 0) {
      errors.push('Aucune offre exploitable extraite des cartes de liste')
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `${listings.length} fiches candidates, extraction Haiku sur ${Math.min(DETAIL_LIMIT, listings.length)}`)

    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const extractedOffers = await extractOffersWithHaiku(item.cardText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? 'Non précisé',
            city:           extracted.city          ?? 'Non précisé',
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
            deadline:       item.deadline ?? parseFlexibleDateText(extracted.deadline),
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
        city:         'Non précisé',
        country:      this.country,
        publishedAt:  item.publishedAt,
        deadline:     item.deadline,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default OffresdemploisBjScraper
