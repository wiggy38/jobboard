import { PrismaClient } from '@prisma/client'
import { SETTING_KEYS } from '@tumaa/shared'
import { warn, info } from './logger'
import { getSetting } from './settings'

const SOURCE = 'monitor'
const STALE_HOURS = 25

export interface SourceAlert {
  id: string
  name: string
  crawlErrors: number
  lastCrawled: Date | null
}

export async function checkSourceHealth(): Promise<SourceAlert[]> {
  const prisma = new PrismaClient()
  const alerts: SourceAlert[] = []

  try {
    const alertThreshold = await getSetting(SETTING_KEYS.SCRAPER_ALERT_THRESHOLD)
    const now = new Date()
    const staleThreshold = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000)

    const activeSources = await prisma.source.findMany({
      where: { isActive: true },
    })

    info(SOURCE, `Vérification de ${activeSources.length} source(s) active(s)`)

    for (const source of activeSources) {
      const isMissed = !source.lastCrawled || source.lastCrawled < staleThreshold

      if (!isMissed) continue

      const updated = await prisma.source.update({
        where: { id: source.id },
        data: { crawlErrors: { increment: 1 } },
      })

      if (updated.crawlErrors > alertThreshold) {
        warn(SOURCE, `[ALERTE] Source ${source.name} : ${alertThreshold} crawls manqués consécutifs`)
        alerts.push({
          id: source.id,
          name: source.name,
          crawlErrors: updated.crawlErrors,
          lastCrawled: source.lastCrawled,
        })
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  return alerts
}
