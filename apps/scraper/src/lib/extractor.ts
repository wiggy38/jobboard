import type { CheerioAPI } from 'cheerio'

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
}

function parseShortDate(raw: string): Date | undefined {
  const m = raw.trim().match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }
  return undefined
}

function parseFrenchDate(raw: string): Date | undefined {
  const cleaned = raw.trim()
  const shortDate = parseShortDate(cleaned)
  if (shortDate) return shortDate
  const m = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (m) {
    const month = FRENCH_MONTHS[m[2].toLowerCase()]
    if (month !== undefined) {
      const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10))
      if (!isNaN(d.getTime())) return d
    }
  }
  return undefined
}

export function extractDeadline(text: string): Date | undefined {
  const numDatePattern = '(\\d{1,2}[\\./\\-]\\d{1,2}[\\./\\-]\\d{2,4})'
  const frDatePattern = '(\\d{1,2}\\s+\\w+\\s+\\d{4})'
  const keywords = "(?:date\\s*limite|dépôt des dossiers?|avant le|jusqu[''`]au|clôture\\s*(?:le)?|deadline)"

  for (const dateRx of [numDatePattern, frDatePattern]) {
    const rx = new RegExp(`${keywords}\\s*:?\\s*${dateRx}`, 'gi')
    let match = rx.exec(text)
    while (match) {
      const parsed = parseFrenchDate(match[match.length - 1])
      if (parsed) return parsed
      match = rx.exec(text)
    }
  }
  return undefined
}

export function extractPhone(text: string): string | undefined {
  // Burkinabe: +226 XX XX XX XX, 00226 XX XX XX XX, or local 2X XX XX XX
  const rx = /(?:\+226|00226)[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|(?<!\d)[2-9]\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g
  const match = rx.exec(text)
  return match ? match[0].replace(/[\s.-]/g, '') : undefined
}

export function extractEmail(text: string): string | undefined {
  const match = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  return match ? match[0] : undefined
}

export function extractLevel(text: string): string | undefined {
  const match = text.match(/\b(BAC\s*\+\s*\d|Licence|Master\s*\d?|Ingénieur|BTS|BEPC|Doctorat)\b/i)
  return match ? match[0].trim() : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trySelectors($: CheerioAPI, el: any, selectors: string[]): string {
  for (const sel of selectors) {
    const txt = $(el).find(sel).first().text().replace(/\s+/g, ' ').trim()
    if (txt) return txt
  }
  return ''
}
