import { Queue, Worker } from 'bullmq'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
import { runPipeline } from './pipeline'
import { checkSourceHealth } from './lib/monitor'
import { buildDailyReport, formatReportText, formatReportHtml } from './lib/report'
import { sendMail } from './lib/mailer'
import { info, error as logError, success, warn } from './lib/logger'


const NAME = 'scheduler'

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
}

const queue = new Queue('scraper', { connection })

// Deux vagues : 12h (midi) et 22h (soir) — offres du jour disponibles dès midi, mises à jour le soir
const SCRAPER_JOBS = [
  { name: 'lefaso-daily',        scraperKey: 'lefaso',        pattern: '0 12 * * *' },
  { name: 'reliefweb-daily',     scraperKey: 'reliefweb',     pattern: '5 12 * * *' },
  { name: 'anpe-daily',          scraperKey: 'anpe-bf',       pattern: '10 12 * * *' },
  { name: 'emploiburkina-daily', scraperKey: 'emploiburkina', pattern: '0 22 * * *' },
  { name: 'criburkina-daily',    scraperKey: 'criburkina',    pattern: '5 22 * * *' },
  { name: 'emploi-lefaso-daily', scraperKey: 'emploi-lefaso', pattern: '10 22 * * *' },
]

const HEALTH_JOB = { name: 'health-check', pattern: '0 */6 * * *' }

// 22h30 — après la vague du soir (22h00-22h10), avant minuit
const DAILY_REPORT_JOB = { name: 'daily-report', pattern: '30 22 * * *' }
const REPORT_EMAIL_TO = process.env.REPORT_EMAIL_TO ?? 'm.miguellao@gmail.com'

// Retries automatiques : 3 tentatives, backoff exponentiel (1min, 2min, 4min)
const RETRY_OPTS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

async function registerJobs(): Promise<void> {
  for (const job of SCRAPER_JOBS) {
    await queue.add(
      job.name,
      { scraperKey: job.scraperKey },
      { repeat: { pattern: job.pattern }, ...RETRY_OPTS }
    )
    info(NAME, `Registered: ${job.name} (${job.pattern})`)
  }

  await queue.add(HEALTH_JOB.name, {}, { repeat: { pattern: HEALTH_JOB.pattern }, ...RETRY_OPTS })
  info(NAME, `Registered: ${HEALTH_JOB.name} (${HEALTH_JOB.pattern})`)

  await queue.add(DAILY_REPORT_JOB.name, {}, { repeat: { pattern: DAILY_REPORT_JOB.pattern }, ...RETRY_OPTS })
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
      try {
        await sendMail({
          to: REPORT_EMAIL_TO,
          subject: `[Tumaa Scraper] Rapport quotidien — ${report.date}`,
          text: formatReportText(report),
          html: formatReportHtml(report),
        })
        success(NAME, `Rapport quotidien envoyé à ${REPORT_EMAIL_TO}`)
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

registerJobs()
  .then(() => info(NAME, 'Scheduler démarré — en attente des jobs...'))
  .catch((err) => {
    logError(NAME, `Échec démarrage scheduler : ${err}`)
    process.exit(1)
  })
