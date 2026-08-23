import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  type SettingKey,
  type ScraperScheduleEntry,
  type ProfileOption,
} from '@tumaa/shared'
import { getSetting, setSetting } from '../../lib/settings'
import { redis } from '../../lib/redis'
import { prisma } from '../../lib/prisma'
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

type ProfileArrayColumn = 'cities' | 'sectors' | 'levels'

// Compte, pour chaque valeur d'une colonne tableau de Profile (cities/sectors/
// levels), le nombre de profils qui la référencent — via unnest() côté
// Postgres (pattern déjà utilisé pour des agrégations similaires dans
// apps/api/src/admin.routes.ts). `values` restreint le comptage à un
// sous-ensemble (ex. les seules valeurs qu'on s'apprête à retirer du
// référentiel) ; omis, compte tout le référentiel utilisé.
async function getProfileUsageCounts(
  column: ProfileArrayColumn,
  values?: string[]
): Promise<Record<string, number>> {
  if (values && values.length === 0) return {}

  const columnIdent = `"${column}"`
  const rows = values
    ? await prisma.$queryRawUnsafe<{ value: string; count: bigint }[]>(
        `SELECT t.value AS value, COUNT(*) AS count
         FROM "Profile" p, unnest(p.${columnIdent}) AS t(value)
         WHERE t.value = ANY($1)
         GROUP BY t.value`,
        values
      )
    : await prisma.$queryRawUnsafe<{ value: string; count: bigint }[]>(
        `SELECT t.value AS value, COUNT(*) AS count
         FROM "Profile" p, unnest(p.${columnIdent}) AS t(value)
         GROUP BY t.value`
      )

  return Object.fromEntries(rows.map((r) => [r.value, Number(r.count)]))
}

const REFERENCE_COLUMN: Partial<Record<SettingKey, ProfileArrayColumn>> = {
  [SETTING_KEYS.REFERENCE_SECTORS]: 'sectors',
  [SETTING_KEYS.REFERENCE_LEVELS]: 'levels',
}

// Valeurs présentes dans `oldValue` mais absentes de `newValue` — couvre à la
// fois une suppression franche (✕) et un renommage (l'admin édite le texte),
// les deux faisant disparaître l'ancienne valeur de la liste.
function removedOptionValues(oldValue: ProfileOption[], newValue: ProfileOption[]): string[] {
  const newValues = new Set(newValue.map((o) => o.value))
  return oldValue.map((o) => o.value).filter((v) => !newValues.has(v))
}

function removedCityValues(
  oldValue: Record<string, ProfileOption[]>,
  newValue: Record<string, ProfileOption[]>
): string[] {
  const oldFlat = Object.values(oldValue).flat()
  const newFlat = Object.values(newValue).flat()
  return removedOptionValues(oldFlat, newFlat)
}

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /admin/settings — valeurs effectives (DB, sinon défaut)
  fastify.get('/admin/settings', { preHandler: guard }, async (_request, reply) => {
    const entries = await Promise.all(
      Object.values(SETTING_KEYS).map(async (key) => [key, await getSetting(key)] as const)
    )
    return reply.send(Object.fromEntries(entries))
  })

  // GET /admin/settings/reference-usage — nb de profils référençant chaque
  // valeur de secteur/ville/niveau, pour empêcher (backoffice + guard PATCH
  // ci-dessous) la suppression d'une valeur encore utilisée.
  fastify.get('/admin/settings/reference-usage', { preHandler: guard }, async (_request, reply) => {
    const [sectors, cities, levels] = await Promise.all([
      getProfileUsageCounts('sectors'),
      getProfileUsageCounts('cities'),
      getProfileUsageCounts('levels'),
    ])
    return reply.send({ sectors, cities, levels })
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

    // Empêche de retirer (✕ ou renommage) une valeur de référentiel encore
    // choisie par au moins un profil — sinon le profil se retrouve avec une
    // préférence orpheline, invisible du référentiel affiché côté web.
    const referenceColumn = REFERENCE_COLUMN[settingKey]
    if (referenceColumn) {
      const oldValue = (await getSetting(settingKey)) as ProfileOption[]
      const removed = removedOptionValues(oldValue, body.value as ProfileOption[])
      if (removed.length > 0) {
        const usage = await getProfileUsageCounts(referenceColumn, removed)
        const blocked = removed
          .filter((v) => usage[v] > 0)
          .map((value) => ({ value, count: usage[value] }))
        if (blocked.length > 0) {
          return reply.status(400).send({
            error: `Impossible de supprimer : encore utilisé par des profils (${blocked
              .map((b) => `${b.value} — ${b.count}`)
              .join(', ')})`,
            blocked,
          })
        }
      }
    } else if (settingKey === SETTING_KEYS.SCRAPER_SCHEDULE) {
      // Un scraper programmé ne doit jamais être retiré depuis le backoffice —
      // seul un rôle SUPER_ADMIN avec accès direct à la base pourrait le faire
      // volontairement. Pour l'arrêter sans perdre sa programmation, utiliser
      // "Désactiver" sur /admin/scrapers (Source.status).
      const oldSchedule = await getSetting(SETTING_KEYS.SCRAPER_SCHEDULE)
      const newKeys = new Set((body.value as ScraperScheduleEntry[]).map((j) => j.scraperKey))
      const removed = oldSchedule.filter((j) => !newKeys.has(j.scraperKey))
      if (removed.length > 0) {
        return reply.status(400).send({
          error: `Impossible de retirer un scraper de la programmation (${removed
            .map((j) => j.scraperKey)
            .join(', ')}) — utilise "Désactiver" sur /admin/scrapers pour l'arrêter.`,
        })
      }
    } else if (settingKey === SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY) {
      const oldValue = await getSetting(SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY)
      const removed = removedCityValues(oldValue, body.value as Record<string, ProfileOption[]>)
      if (removed.length > 0) {
        const usage = await getProfileUsageCounts('cities', removed)
        const blocked = removed
          .filter((v) => usage[v] > 0)
          .map((value) => ({ value, count: usage[value] }))
        if (blocked.length > 0) {
          return reply.status(400).send({
            error: `Impossible de supprimer : encore utilisé par des profils (${blocked
              .map((b) => `${b.value} — ${b.count}`)
              .join(', ')})`,
            blocked,
          })
        }
      }
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
