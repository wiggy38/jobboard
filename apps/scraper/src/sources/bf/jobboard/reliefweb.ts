import axios from 'axios'
import { RawJobOffer, ScraperResult } from '@tumaa/shared'
import { BaseScraper } from '../../../lib/scraper-base'
import { info, warn } from '../../../lib/logger'

// ReliefWeb API v2 — requires a registered appname (https://apidoc.reliefweb.int/parameters#appname)
// Set RELIEFWEB_APPNAME in your environment after registering at https://apidoc.reliefweb.int/
const APPNAME = process.env.RELIEFWEB_APPNAME ?? 'tumaa'
const BASE_URL = 'https://api.reliefweb.int/v2/jobs'

function buildApiUrl(): string {
  return `${BASE_URL}?appname=${encodeURIComponent(APPNAME)}`
}

const QUERY_BODY = {
  filter: {
    operator: 'AND',
    conditions: [
      { field: 'country.name', value: 'Burkina Faso' },
    ],
  },
  fields: {
    include: ['title', 'body', 'date', 'source', 'city', 'career_categories', 'experience'],
  },
  limit: 20,
  sort: ['date:desc'],
}

interface ReliefWebField {
  title?: string
  body?: string
  date?: { created?: string }
  source?: { name: string }[]
  city?: { name: string }[]
  career_categories?: { name: string }[]
  experience?: { name: string }[]
}

interface ReliefWebItem {
  id: string
  fields: ReliefWebField
  links?: { self?: { href?: string } }
}

export class ReliefWebScraper extends BaseScraper {
  readonly name = 'reliefweb'
  readonly url = BASE_URL

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = []
    const offers: RawJobOffer[] = []

    const apiUrl = buildApiUrl()
    info(this.name, `Querying ReliefWeb API v2 for Burkina Faso jobs`)

    let items: ReliefWebItem[]
    try {
      const response = await axios.post<{ data: ReliefWebItem[] }>(apiUrl, QUERY_BODY, {
        timeout: 15_000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TumaaBot/1.0 (+https://tumaa.bf)',
        },
      })
      items = response.data?.data ?? []
    } catch (err) {
      const msg = `Failed to query ReliefWeb API: ${this.handleError(err)}`
      errors.push(msg)
      return { source: this.name, offers: [], errors, scrapedAt: new Date() }
    }

    info(this.name, `Received ${items.length} jobs from API`)

    for (const item of items) {
      try {
        const f = item.fields
        const title = f.title?.trim()
        if (!title) {
          warn(this.name, `Skipping item ${item.id}: missing title`)
          continue
        }

        const organization = f.source?.[0]?.name ?? 'Non précisé'
        const city = f.city?.[0]?.name ?? 'Ouagadougou'
        const sector = f.career_categories?.[0]?.name
        const level = f.experience?.[0]?.name
        const description = f.body?.slice(0, 3000)

        const sourceUrl =
          item.links?.self?.href ??
          `https://reliefweb.int/job/${item.id}`

        let publishedAt: Date | undefined
        if (f.date?.created) {
          const d = new Date(f.date.created)
          if (!isNaN(d.getTime())) publishedAt = d
        }

        const raw: RawJobOffer = {
          title,
          organization,
          city,
          sector,
          level,
          description,
          sourceUrl,
          publishedAt,
        }

        offers.push(raw)
        info(this.name, `Scraped: "${title.slice(0, 60)}"`)
      } catch (err) {
        const msg = `Failed to parse item ${item.id}: ${this.handleError(err)}`
        warn(this.name, msg)
        errors.push(msg)
      }
    }

    return { source: this.name, offers, errors, scrapedAt: new Date() }
  }
}

export default ReliefWebScraper
