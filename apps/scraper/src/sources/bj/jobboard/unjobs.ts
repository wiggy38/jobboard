import * as cheerio from 'cheerio'
import { BrowserContext } from 'playwright'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { getBrowser } from '../../../lib/browser'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

// Listing statique paginé (/duty_stations/benin/N), pas d'API ni de flux RSS
// par pays (seul /skills/rss existe, par métier). Contrairement aux autres
// sources BJ, un simple GET axios avec User-Agent navigateur renvoie 403
// (le site bloque spécifiquement les clients HTTP non-navigateur, y compris
// avec un User-Agent usurpé — curl brut passe, axios/Node non) : d'où
// Playwright ici en Phase 1, avec un minimum de contre-mesures anti-détection
// (navigator.webdriver masqué, --disable-blink-features), faute de quoi même
// Chromium headless se fait bloquer. Cartes en "div.job" : lien ".jtitle"
// (titre+url), puis organisation en texte brut juste après le premier <br>.
const BASE_URL = 'https://unjobs.org'
const SITE_URL = `${BASE_URL}/duty_stations/benin`
const MAX_PAGES = 3
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 1500

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface ListingItem {
  title: string
  sourceUrl: string
  excerpt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPageHtml(context: BrowserContext, url: string): Promise<string> {
  const page = await context.newPage()
  try {
    await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    return await page.content()
  } finally {
    await page.close()
  }
}

async function fetchListingPage(context: BrowserContext, page: number): Promise<ListingItem[]> {
  const pageUrl = page === 1 ? SITE_URL : `${SITE_URL}/${page}`
  const html = await fetchPageHtml(context, pageUrl)
  const $ = cheerio.load(html)

  const items: ListingItem[] = []
  $('div.job').each((_i, el) => {
    const $card = $(el)
    const $link = $card.find('a.jtitle').first()
    const title = extractText($link)
    const sourceUrl = $link.attr('href') ?? ''
    if (!title || !sourceUrl) return
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    const cardHtml = $card.html() ?? ''
    const orgSegment = cardHtml.split(/<br\s*\/?>/i)[1] ?? ''
    const excerpt = extractText(cheerio.load(orgSegment)('body'))

    items.push({ title, sourceUrl, excerpt })
  })

  return items
}

export class UnjobsScraper extends BaseScraper {
  readonly name = 'unjobs'
  readonly url = SITE_URL
  readonly sourceType = 'JOBBOARD'
  readonly country = 'BJ'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []
    const rejectedNotJobOffer: string[] = []

    const browser = await getBrowser()
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'fr-FR' })
    await context.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => undefined })
    })

    try {
      const listings: ListingItem[] = []
      for (let page = 1; page <= MAX_PAGES; page++) {
        info(this.name, `Fetching listing page ${page}/${MAX_PAGES}`)
        try {
          const items = await fetchListingPage(context, page)
          if (items.length === 0) break
          listings.push(...items)
        } catch (err) {
          const msg = `Listing fetch failed (page ${page}): ${this.handleError(err)}`
          errors.push(msg)
          warn(this.name, msg)
          break
        }

        if (page < MAX_PAGES) await sleep(POLITE_DELAY_MS)
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
          const detailHtml = await fetchPageHtml(context, item.sourceUrl)
          const d$ = cheerio.load(detailHtml)
          d$('script, style, nav, header, footer, form').remove()
          // Le rendu navigateur (contrairement au HTML brut) ajoute un
          // conteneur ".container" supplémentaire en fin de page (bannière
          // cookies/consentement) — on prend celui avec le plus de texte
          // plutôt que de supposer une position fixe.
          let mainContainerText = ''
          d$('.container').each((_i, el) => {
            const text = extractText(d$(el))
            if (text.length > mainContainerText.length) mainContainerText = text
          })
          const pageText = mainContainerText.replace(/\s{3,}/g, '\n') || item.excerpt

          const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

          if (extractedOffers.length === 0) {
            info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}" — ${item.sourceUrl}`)
            rejectedNotJobOffer.push(item.sourceUrl)
            continue
          }

          for (const extracted of extractedOffers) {
            const offer: RawJobOffer = {
              title:          extracted.title        ?? item.title,
              organization:   extracted.organization  ?? (item.excerpt || 'Non précisé'),
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
          organization: item.excerpt || 'Non précisé',
          city:         'Bénin',
          country:      this.country,
          sourceUrl:    item.sourceUrl,
        })
      }

      info(this.name, `Done. ${offers.length} offers, ${errors.length} errors.`)
      return { source: this.name, offers, errors, scrapedAt: new Date(), rejectedNotJobOffer }
    } finally {
      await context.close()
    }
  }
}

export default UnjobsScraper
