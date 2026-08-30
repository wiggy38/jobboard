import { Queue, Worker } from 'bullmq'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
import { SETTING_KEYS } from '@tumaa/shared'
import { runPipeline } from './pipeline'
import { checkSourceHealth } from './lib/monitor'
import { buildDailyReport, formatReportText, formatReportHtml } from './lib/report'
import { sendMail } from './lib/mailer'
import { info, error as logError, success, warn } from './lib/logger'
import { syncSources } from './lib/sync-sources'
import { getSetting } from './lib/settings'


const NAME = 'scheduler'

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
}

const queue = new Queue('scraper', { connection })

const HEALTH_JOB = { name: 'health-check', pattern: '0 */6 * * *' }

// 00h15 — après la vague unique de scraping (23h00-00h05)
const DAILY_REPORT_JOB = { name: 'daily-report', pattern: '15 0 * * *' }

async function registerJobs(): Promise<void> {
  // Programmation des scrapers (SETTING_KEYS.SCRAPER_SCHEDULE) éditable depuis le
  // backoffice — l'API admin réconcilie directement la queue BullMQ à chaque
  // modification (voir apps/api/src/routes/admin/settings.ts), cette liste au
  // démarrage ne sert qu'à l'amorçage initial / redémarrage du process.
  const scraperJobs = await getSetting(SETTING_KEYS.SCRAPER_SCHEDULE)
  const attempts = await getSetting(SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS)
  const retryOpts = { attempts, backoff: { type: 'exponential' as const, delay: 60_000 } }

  for (const job of scraperJobs) {
    await queue.add(
      job.name,
      { scraperKey: job.scraperKey },
      { repeat: { pattern: job.pattern }, ...retryOpts }
    )
    info(NAME, `Registered: ${job.name} (${job.pattern})`)
  }

  await queue.add(HEALTH_JOB.name, {}, { repeat: { pattern: HEALTH_JOB.pattern }, ...retryOpts })
  info(NAME, `Registered: ${HEALTH_JOB.name} (${HEALTH_JOB.pattern})`)

  await queue.add(DAILY_REPORT_JOB.name, {}, { repeat: { pattern: DAILY_REPORT_JOB.pattern }, ...retryOpts })
  info(NAME, `Registered: ${DAILY_REPORT_JOB.name} (${DAILY_REPORT_JOB.pattern})`)
}

const worker = new Worker(
  'scraper',
  async (job) => {
    const ts = new Date().toISOString()
    info(NAME, `[${ts}] Starting job: ${job.name}`)

    if (job.name === HEALTH_JOB.name) {
      const alerts = await checkSourceHealth()
      info(NAME, `Health check done — ${alerts.length} alerte(s)`)
      return { alerts }
    }

    if (job.name === DAILY_REPORT_JOB.name) {
      const report = await buildDailyReport(queue)
      const reportEmailTo = await getSetting(SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO)
      try {
        await sendMail({
          to: reportEmailTo,
          subject: `[Tumaa Scraper] Rapport quotidien — ${report.date}`,
          text: formatReportText(report),
          html: formatReportHtml(report),
        })
        success(NAME, `Rapport quotidien envoyé à ${reportEmailTo}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warn(NAME, `Échec envoi rapport quotidien : ${msg}`)
      }
      return { totals: report.totals, alerts: report.alerts.length }
    }

    const scraperKey: string = job.data.scraperKey ?? job.name.replace('-daily', '')
    const result = await runPipeline(scraperKey)
    success(NAME, `[${new Date().toISOString()}] ${job.name} → ${JSON.stringify(result)}`)
    return result
  },
  {
    connection,
    lockDuration: 120_000,    // 2 min — scraper lefaso prend ~35s
    lockRenewTime: 30_000,    // renouvelle le lock toutes les 30s
  }
)

worker.on('completed', (job) => {
  info(NAME, `Job ${job.name} terminé avec succès`)
})

worker.on('failed', (job, err) => {
  logError(NAME, `Job ${job?.name ?? '?'} échoué : ${err.message}`)
})

syncSources()
  .then(() => info(NAME, 'Sources synchronisées avec le registre des scrapers'))
  .then(registerJobs)
  .then(() => info(NAME, 'Scheduler démarré — en attente des jobs...'))
  .catch((err) => {
    logError(NAME, `Échec démarrage scheduler : ${err}`)
    process.exit(1)
  })
