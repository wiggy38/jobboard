/**
 * Diagnose tool — dumps HTML structure of a scraper source for debugging.
 * Usage: pnpm scraper:diagnose <source-name>
 * Example: pnpm scraper:diagnose emploiburkina
 */
import axios from 'axios'
import * as cheerio from 'cheerio'
import sources from './sources'

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

const sourceName = process.argv[2]

if (!sourceName) {
  console.log('Usage: pnpm scraper:diagnose <source>')
  console.log('Available sources:', [...sources.keys()].join(', '))
  process.exit(1)
}

const scraper = sources.get(sourceName)
if (!scraper) {
  console.error(`Unknown source "${sourceName}". Available: ${[...sources.keys()].join(', ')}`)
  process.exit(1)
}

;(async () => {
  console.log(`\n[diagnose] Fetching ${scraper.url}`)
  let html: string
  try {
    const resp = await axios.get(scraper.url, { headers: DEFAULT_HEADERS, timeout: 15_000 })
    html = resp.data as string
    console.log(`[diagnose] Status: ${resp.status}, Content-Length: ${html.length} bytes`)
  } catch (err: unknown) {
    console.error('[diagnose] Fetch failed:', (err as Error).message)
    process.exit(1)
  }

  const $ = cheerio.load(html)

  console.log(`\n[diagnose] Page title: ${$('title').text().trim()}`)

  console.log('\n[diagnose] Elements with classes and text (up to 60):')
  let count = 0
  $('*').each((_i, el) => {
    if (count >= 60) return false as unknown as void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = (el as any).tagName as string
    const classes = $(el).attr('class') ?? ''
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (text.length > 15 && classes.length > 2) {
      console.log(`  ${tag}.${classes.replace(/\s+/g, '.')} → ${text.slice(0, 70)}`)
      count++
    }
  })

  console.log('\n[diagnose] All unique class names:')
  const classSet = new Set<string>()
  $('[class]').each((_i, el) => {
    const raw = $(el).attr('class') ?? ''
    raw.split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c))
  })
  console.log([...classSet].sort().join(', '))

  console.log('\n[diagnose] Raw HTML (first 1000 chars):')
  console.log(html.slice(0, 1000))
})()
