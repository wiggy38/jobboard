import axios from 'axios'
import * as cheerio from 'cheerio'
import { BrowserContext } from 'playwright'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { getBrowser } from '../../../lib/browser'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing injecté en JS (le HTML servi par le backend ne contient qu'un
// conteneur "#recrutements" vide) : Playwright obligatoire en Phase 1. Les
// fiches détail, elles, sont du HTML classique servi côté serveur — un axios
// simple suffit en Phase 2. Les 317 offres (toutes, actives et archivées)
// sont listées sur une seule page ("a.job__item") — l'icône ".job__desable"
// est présente identiquement sur chaque carte (juste une action UI, pas un
// indicateur de statut réel), donc pas de filtre déterministe possible côté
// listing ; le tri actif/clôturé se fait via la date de clôture extraite par
// Haiku sur la fiche détail (champ "Cloture: DD mois YYYY"), TTL pipeline en
// aval. La date affichée en carte est la date de publication, pas la clôture.
// Le champ "ville" de la carte est un texte statique du template (toujours
// littéralement "ville"), jamais une vraie donnée — on l'ignore.
const BASE_URL = 'https://www.finexconsulting.net'
const SITE_URL = `${BASE_URL}/recrutements`
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HTTP_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

interface ListingItem {
  title: string
  sourceUrl: string
  publishedAt?: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Dates textuelles françaises type "11 mai 2026".
function parseListingDate(raw: string | undefined): Date | undefined {
  return parseFlexibleDateText(raw)
}

async function fetchListingPage(context: BrowserContext): Promise<ListingItem[]> {
  const page = await context.newPage()
  let html: string
  try {
    await page.goto(SITE_URL, { timeout: 30_000, waitUntil: 'networkidle' })
    html = await page.content()
  } finally {
    await page.close()
  }

  const $ = cheerio.load(html)
  const items: ListingItem[] = []

  $('a.job__item').each((_i, el) => {
    const $card = $(el)

    const title = extractText($card.find('.job__title'))
    const href = $card.attr('href') ?? ''
    if (!title || !href) return
    if (isLikelyNotJobOffer(title, href)) return

    const infoText = extractText($card.find('.job__others_info'))
    const dateMatch = infoText.match(/\d{1,2}\s+\p{L}+\s+\d{4}/u)

    items.push({ title, sourceUrl: href, publishedAt: parseListingDate(dateMatch?.[0]) })
  })

  return items
}

export class FinexConsultingScraper extends BaseScraper {
  readonly name = 'finexconsulting'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const browser = await getBrowser()
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'fr-FR' })

    let listings: ListingItem[] = []
    try {
      listings = await fetchListingPage(context)
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      await context.close()
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    } finally {
      await context.close()
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
        const pageText = extractText(d$('body'))

        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
          rejectedNotJobOffer.push(item.sourceUrl)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title        ?? item.title,
            organization:   extracted.organization  ?? 'Non précisé',
            city:           extracted.city          ?? 'Bénin',
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
            deadline:       parseFlexibleDateText(extracted.deadline),
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
        organization: 'Non précisé',
        city:         'Bénin',
        country:      this.country,
        publishedAt:  item.publishedAt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
    return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
  }
}

export default FinexConsultingScraper
