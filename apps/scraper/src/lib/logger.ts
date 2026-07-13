import fs from 'fs'
import path from 'path'

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

// Un fichier JSON-lines par jour — facile à grep/tail et à parser plus tard
// (ex. "voir tout ce qui s'est passé sur criburkina hier soir").
const LOG_DIR = path.resolve(__dirname, '../../logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

type Level = 'info' | 'warn' | 'error' | 'success'

function writeToFile(level: Level, source: string, msg: string, payload?: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    source,
    msg,
    ...(payload !== undefined ? { payload } : {}),
  })
  const file = path.join(LOG_DIR, `scraper-${new Date().toISOString().slice(0, 10)}.log`)
  try {
    fs.appendFileSync(file, line + '\n')
  } catch {
    // Ne jamais faire planter le scraper à cause d'un problème d'écriture de log
  }
}

export function info(source: string, msg: string, payload?: unknown): void {
  console.log(`${C.cyan}[${source}]${C.reset} ${msg}`)
  writeToFile('info', source, msg, payload)
}

export function warn(source: string, msg: string, payload?: unknown): void {
  console.warn(`${C.yellow}[${source}]${C.reset} ${msg}`)
  writeToFile('warn', source, msg, payload)
}

export function error(source: string, msg: string, payload?: unknown): void {
  console.error(`${C.red}[${source}]${C.reset} ${msg}`)
  writeToFile('error', source, msg, payload)
}

export function success(source: string, msg: string, payload?: unknown): void {
  console.log(`${C.green}[${source}]${C.reset} ${msg}`)
  writeToFile('success', source, msg, payload)
}
