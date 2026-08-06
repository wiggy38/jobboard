import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  type SettingKey,
  type ScraperScheduleEntry,
} from '@tumaa/shared'
import { getSetting, setSetting } from '../../lib/settings'
import { redis } from '../../lib/redis'
import { adminAuth, requireRole } from '../../middleware/adminAuth'

// Réglages métier édités depuis /admin/parametres — réservé SUPER_ADMIN, ces
// paramètres touchent la facturation, le budget WhatsApp et l'exécution des
// scrapers en production.
const guard = [adminAuth, requireRole('SUPER_ADMIN')]

const VALID_KEYS = new Set<string>(Object.values(SETTING_KEYS))

// Retries automatiques appliqués aux jobs BullMQ — même valeur que
// apps/scraper/src/scheduler.ts (RETRY_OPTS d'origine).
function retryOpts(attempts: number) {
  return { attempts, backoff: { type: 'exponential' as const, delay: 60_000 } }
}

// Réconcilie la queue BullMQ 'scraper' avec la nouvelle programmation, pour
// que le changement soit visible sans redémarrer apps/scraper/src/scheduler.ts.
async function reconcileScraperSchedule(newSchedule: ScraperScheduleEntry[]): Promise<void> {
  const attempts = await getSetting(SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS)
  const queue = new Queue('scraper', { connection: redis })
  try {
    const existingRepeatables = await queue.getRepeatableJobs()

    for (const entry of newSchedule) {
      const existing = existingRepeatables.find((r) => r.name === entry.name)
      if (existing && existing.pattern === entry.pattern) continue // inchangé

      if (existing) {
        await queue.removeRepeatableByKey(existing.key)
      }
      await queue.add(
        entry.name,
        { scraperKey: entry.scraperKey },
        { repeat: { pattern: entry.pattern }, ...retryOpts(attempts) }
      )
    }
  } finally {
    await queue.close()
  }
}

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /admin/settings — valeurs effectives (DB, sinon défaut)
  fastify.get('/admin/settings', { preHandler: guard }, async (_request, reply) => {
    const entries = await Promise.all(
      Object.values(SETTING_KEYS).map(async (key) => [key, await getSetting(key)] as const)
    )
    return reply.send(Object.fromEntries(entries))
  })

  // PATCH /admin/settings/:key — met à jour une clé (body: { value })
  fastify.patch('/admin/settings/:key', { preHandler: guard }, async (request, reply) => {
    const { key } = request.params as { key: string }
    if (!VALID_KEYS.has(key)) {
      return reply.status(404).send({ error: 'Paramètre inconnu' })
    }
    const settingKey = key as SettingKey

    const body = request.body as { value?: unknown }
    if (body.value === undefined) {
      return reply.status(400).send({ error: 'value requis' })
    }

    // Validation minimale de forme — évite d'écrire une valeur qui ferait
    // planter les lectures côté api/bot/scraper (ex. type incompatible).
    const defaultValue = DEFAULT_SETTINGS[settingKey]
    const expectedType = Array.isArray(defaultValue) ? 'array' : typeof defaultValue
    const actualType = Array.isArray(body.value) ? 'array' : typeof body.value
    if (actualType !== expectedType) {
      return reply.status(400).send({ error: `Type invalide pour ${key} (attendu ${expectedType})` })
    }

    await setSetting(settingKey, body.value as never)

    if (settingKey === SETTING_KEYS.SCRAPER_SCHEDULE) {
      try {
        await reconcileScraperSchedule(body.value as ScraperScheduleEntry[])
      } catch (err) {
        fastify.log.error(err, 'settings/reconcileScraperSchedule')
        return reply.status(200).send({
          ok: true,
          warning: 'Sauvegardé, mais la reprogrammation immédiate de la queue a échoué — elle sera appliquée au prochain redémarrage du scheduler.',
        })
      }
    }

    return reply.send({ ok: true })
  })
}
