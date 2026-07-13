import { ScraperResult } from '@tumaa/shared'
import { error as logError } from './logger'

export abstract class BaseScraper {
  abstract readonly name: string
  abstract readonly url: string
  readonly sourceType: string = 'MEDIA_LOCAL'
  readonly country: string = 'BF'

  // seenSourceUrls : sourceUrl déjà en base pour cette source, fourni par le
  // pipeline. Les scrapers à budget de détail limité (DETAIL_LIMIT) s'en
  // servent pour prioriser les offres jamais vues plutôt que retraiter les
  // mêmes offres à chaque run — voir lib/pagination.ts.
  abstract scrape(seenSourceUrls?: Set<string>): Promise<ScraperResult>

  protected log(msg: string): void {
    console.log(`[${this.name}] ${msg}`)
  }

  protected handleError(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
  }
}
