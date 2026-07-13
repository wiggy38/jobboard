import { Queue } from 'bullmq'
import { PipelineResult } from '../pipeline'
import { SourceAlert } from './monitor'

const WINDOW_MS = 24 * 60 * 60 * 1000
const REPORT_JOB_NAME = 'daily-report'
const HEALTH_JOB_NAME = 'health-check'

export interface DailyReportData {
  date: string
  jobs: Array<{ name: string; result?: PipelineResult; failed?: boolean; error?: string }>
  totals: { scraped: number; inserted: number; duplicates: number; errors: number }
  alerts: string[]
}

/**
 * Agrège les jobs BullMQ terminés dans les dernières 24h (résultats déjà
 * retournés par runPipeline) — pas de nouvelle source de vérité, juste une lecture.
 */
export async function buildDailyReport(queue: Queue): Promise<DailyReportData> {
  const since = Date.now() - WINDOW_MS

  const [completed, failed] = await Promise.all([
    queue.getJobs(['completed'], 0, 500),
    queue.getJobs(['failed'], 0, 500),
  ])

  const jobs: DailyReportData['jobs'] = []
  const totals = { scraped: 0, inserted: 0, duplicates: 0, errors: 0 }
  const alerts: string[] = []

  for (const job of completed) {
    if (!job.finishedOn || job.finishedOn < since) continue
    if (job.name === REPORT_JOB_NAME) continue

    if (job.name === HEALTH_JOB_NAME) {
      const healthAlerts = (job.returnvalue?.alerts ?? []) as SourceAlert[]
      for (const a of healthAlerts) alerts.push(`Source en échec répété : ${a.name} (${a.crawlErrors} crawls manqués)`)
      continue
    }

    const result = job.returnvalue as PipelineResult | undefined
    if (result) {
      totals.scraped += result.totalScraped
      totals.inserted += result.totalInserted
      totals.duplicates += result.totalDuplicates
      totals.errors += result.totalErrors
    }
    jobs.push({ name: job.name, result })
  }

  for (const job of failed) {
    if (!job.finishedOn || job.finishedOn < since) continue
    if (job.name === REPORT_JOB_NAME) continue
    jobs.push({ name: job.name, failed: true, error: job.failedReason })
  }

  return { date: new Date().toISOString().slice(0, 10), jobs, totals, alerts }
}

export function formatReportText(data: DailyReportData): string {
  const lines = [
    `Rapport quotidien Tumaa Scraper — ${data.date}`,
    '',
    `Offres scrapées : ${data.totals.scraped}`,
    `Offres insérées : ${data.totals.inserted}`,
    `Doublons filtrés : ${data.totals.duplicates}`,
    `Erreurs : ${data.totals.errors}`,
    '',
    'Détail par source :',
    ...data.jobs.map(j =>
      j.failed
        ? `  - ${j.name} : ÉCHEC (${j.error ?? 'raison inconnue'})`
        : j.result?.skipped
          ? `  - ${j.name} : IGNORÉ (source désactivée par le circuit breaker)`
          : j.result
            ? `  - ${j.name} : ${j.result.totalInserted} insérées / ${j.result.totalScraped} scrapées, ${j.result.totalDuplicates} doublons, ${j.result.totalErrors} erreurs`
            : `  - ${j.name} : aucun résultat`
    ),
  ]

  if (data.alerts.length > 0) {
    lines.push('', 'Alertes :', ...data.alerts.map(a => `  - ${a}`))
  }

  return lines.join('\n')
}

export function formatReportHtml(data: DailyReportData): string {
  const rows = data.jobs
    .map(j => {
      if (j.failed) return `<tr><td>${j.name}</td><td colspan="4" style="color:#b91c1c">ÉCHEC — ${j.error ?? 'raison inconnue'}</td></tr>`
      if (j.result?.skipped) return `<tr><td>${j.name}</td><td colspan="4" style="color:#b45309">IGNORÉ — source désactivée par le circuit breaker</td></tr>`
      if (!j.result) return `<tr><td>${j.name}</td><td colspan="4">aucun résultat</td></tr>`
      const r = j.result
      return `<tr><td>${j.name}</td><td>${r.totalScraped}</td><td>${r.totalInserted}</td><td>${r.totalDuplicates}</td><td>${r.totalErrors}</td></tr>`
    })
    .join('')

  const alertsHtml =
    data.alerts.length > 0
      ? `<h3>Alertes</h3><ul>${data.alerts.map(a => `<li>${a}</li>`).join('')}</ul>`
      : ''

  return `
    <h2>Rapport quotidien Tumaa Scraper — ${data.date}</h2>
    <p>
      <strong>${data.totals.inserted}</strong> offres insérées sur
      <strong>${data.totals.scraped}</strong> scrapées —
      ${data.totals.duplicates} doublons, ${data.totals.errors} erreurs.
    </p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th>Source</th><th>Scrapées</th><th>Insérées</th><th>Doublons</th><th>Erreurs</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${alertsHtml}
  `
}
