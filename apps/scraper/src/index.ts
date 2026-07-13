import dotenv from 'dotenv'
import path from 'path'
// Cherche .env à la racine du monorepo (trois niveaux au-dessus de src/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
import { info, error as logError } from './lib/logger'
import { closeBrowser } from './lib/browser'
import { runPipeline } from './pipeline'
import sources from './sources'

const SOURCE = 'cli'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const sourceName = args.find(a => !a.startsWith('--'))
  const isDryRun = args.includes('--dry-run')

  if (!sourceName) {
    console.log('Usage: pnpm scraper:run <source|all> [--dry-run]')
    console.log(`Available sources: ${[...sources.keys()].join(', ')}`)
    process.exit(1)
  }

  try {
    if (sourceName === 'all') {
      for (const name of sources.keys()) {
        info(SOURCE, `--- Running pipeline for: ${name} ---`)
        try {
          const result = await runPipeline(name, isDryRun)
          console.log(JSON.stringify(result, null, 2))
        } catch (err) {
          logError(SOURCE, `Source "${name}" échouée : ${err instanceof Error ? err.message : String(err)}`, {
            sourceName: name,
            stack: err instanceof Error ? err.stack : undefined,
          })
        }
      }
    } else {
      const result = await runPipeline(sourceName, isDryRun)
      console.log(JSON.stringify(result, null, 2))
    }
  } catch (err) {
    logError(SOURCE, err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await closeBrowser()
  }
}

main()
