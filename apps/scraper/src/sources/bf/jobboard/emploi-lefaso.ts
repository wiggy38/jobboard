import axios from 'axios'
import * as cheerio from 'cheerio'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'
import { extractOffersWithHaiku, parseFlexibleDateText } from '../../../lib/ai-extractor'
import { isLikelyNotJobOffer } from '../../../lib/content-filter'
import { prioritizeUnseen } from '../../../lib/pagination'

const BASE_URL = 'https://emploi.lefaso.net'
const LISTING_URL = `${BASE_URL}/?page=offres`
const DETAIL_LIMIT = 20
const POLITE_DELAY_MS = 2000

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListingItem {
  title: string
  sourceUrl: string
  publishedAt?: Date
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, ' ').trim()
}

function toAbsUrl(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
}

// ─── Parsing de la page de liste ─────────────────────────────────────────────

function parseListingPage(html: string): ListingItem[] {
  const $ = cheerio.load(html)
  const items: ListingItem[] = []
  const seen = new Set<string>()

  // Les vraies offres vivent dans .liste-objets.offres (colonne principale).
  // La colonne latérale (.col-md-4, "Conseil du recruteur" / "Vidéo Conseil")
  // contient des articles conseil ("Comment réussir...", "5 règles pour...")
  // qui ne sont jamais des offres — on les exclut en scopant le sélecteur au
  // conteneur des offres plutôt qu'à toute la page. Si ce conteneur venait à
  // disparaître (refonte du site), on retombe sur tous les liens .html de la
  // page — le pré-filtre isLikelyNotJobOffer reste alors la seule protection.
  const scoped = $('.liste-objets.offres a[href$=".html"]')
  const anchors = scoped.length > 0 ? scoped : $('a[href$=".html"]')

  anchors.each((_i, el) => {
    const $a = $(el)
    const href = $a.attr('href') ?? ''
    // Exclure les liens de navigation hors-offres (index.html, page=, etc.)
    if (!href || href.toLowerCase().includes('index') || href.includes('page=')) return

    const sourceUrl = toAbsUrl(href)
    if (seen.has(sourceUrl)) return
    seen.add(sourceUrl)

    // Le titre est soit le texte du lien, soit celui d'un ancêtre proche
    const titleFromLink = extractText($a)
    const titleFromParent = extractText($a.closest('h2, h3, h4, li, div').first())
    const title = (titleFromLink.length > 10 ? titleFromLink : titleFromParent).slice(0, 200)
    if (!title) return

    // Pré-filtre : pages de contact, mentions légales, listicles, agrégats...
    if (isLikelyNotJobOffer(title, sourceUrl)) return

    // Date de publication éventuelle (élément sibling ou parent)
    let publishedAt: Date | undefined
    const dateText = extractText($a.closest('li, div, article').find('time, [class*="date"]').first())
    if (dateText) {
      const d = new Date(dateText)
      if (!isNaN(d.getTime())) publishedAt = d
    }

    items.push({ title, sourceUrl, publishedAt })
  })

  return items
}

// ─── Scraper ─────────────────────────────────────────────────────────────────

export class EmploiLefasoScraper extends BaseScraper {
  readonly name = 'emploi-lefaso'
  readonly url = LISTING_URL
  readonly sourceType = 'JOBBOARD'

  async scrape(seenSourceUrls: Set<string> = new Set()): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    // ── Étape 1 : page de liste ──────────────────────────────────────────────
    info(this.name, `Fetching listing: ${LISTING_URL}`)

    let html = ''
    try {
      const resp = await axios.get(LISTING_URL, { headers: HTTP_HEADERS, timeout: 15_000 })
      html = resp.data as string
    } catch (err) {
      const msg = `Listing fetch failed: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    const listings = parseListingPage(html)

    if (listings.length === 0) {
      errors.push('Aucun lien d\'offre trouvé sur la page de liste — structure HTML à inspecter')
      warn(this.name, `HTML dump (500 chars): ${html.slice(0, 500)}`)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Found ${listings.length} offer links on listing page`)

    // ── Étape 2 : pages de détail (top N, offres jamais vues priorisées) ────
    const ordered = prioritizeUnseen(listings, item => item.sourceUrl, seenSourceUrls)
    const targets = ordered.slice(0, DETAIL_LIMIT)

    for (const item of targets) {
      await sleep(POLITE_DELAY_MS)

      try {
        const detailResp = await axios.get(item.sourceUrl, { headers: HTTP_HEADERS, timeout: 15_000 })
        // Extraire le texte brut (plus propre que le HTML pour Haiku)
        const $d = cheerio.load(detailResp.data as string)
        // Supprimer scripts, styles et nav pour réduire le bruit
        $d('script, style, nav, header, footer, [class*="menu"], [class*="sidebar"]').remove()
        const pageText = $d('body').text().replace(/\s{3,}/g, '\n').trim()

        info(this.name, `Detail page fetched: ${item.sourceUrl} (${pageText.length} chars)`)

        // ── Haiku extrait les champs structurés depuis le texte brut ─────────
        // Une fiche peut décrire plusieurs postes distincts (ex: "05 postes à
        // pourvoir au sein d'une mutuelle") — extractOffersWithHaiku retourne
        // alors un élément par poste, tous partageant le même sourceUrl.
        const extractedOffers = await extractOffersWithHaiku(pageText, item.title, this.name)

        if (extractedOffers.length === 0) {
          info(this.name, `Rejeté (pas une offre) : "${item.title.slice(0, 60)}"`)
          continue
        }

        for (const extracted of extractedOffers) {
          const offer: RawJobOffer = {
            title:          extracted.title      ?? item.title,
            organization:   extracted.organization ?? 'Non précisé',
            city:           extracted.city       ?? 'Ouagadougou',
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

    // ── Offres restantes (listing only, pas de page de détail) ───────────────
    for (const item of ordered.slice(DETAIL_LIMIT)) {
      offers.push({
        title:        item.title,
        organization: 'Non précisé',
        city:         'Ouagadougou',
        publishedAt:  item.publishedAt,
        sourceUrl:    item.sourceUrl,
      })
    }

    info(this.name, `Done. ${offers.length} offers, ${errors.length} errors`)
    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default EmploiLefasoScraper
