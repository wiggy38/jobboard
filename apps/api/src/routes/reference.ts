import type { FastifyInstance } from 'fastify'
import { SETTING_KEYS } from '@tumaa/shared'
import { getSetting } from '../lib/settings'

// Référentiels villes/secteurs/niveaux — édités en backoffice (voir
// routes/admin/settings.ts), consommés publiquement par le formulaire
// d'abonnement (apps/web) et par le formulaire employeur (apps/backoffice).
export async function referenceRoutes(fastify: FastifyInstance) {
  fastify.get('/api/reference/options', async (_request, reply) => {
    const [levels, sectors, citiesByCountry] = await Promise.all([
      getSetting(SETTING_KEYS.REFERENCE_LEVELS),
      getSetting(SETTING_KEYS.REFERENCE_SECTORS),
      getSetting(SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY),
    ])

    return reply.send({ levels, sectors, citiesByCountry })
  })

  // Limites de plan effectives (défaut PLAN_LIMITS, ou surcharge backoffice
  // via SETTING_KEYS.PLAN_LIMITS) — consommées publiquement par /subscribe
  // (apps/web) pour ne jamais afficher des chiffres obsolètes.
  fastify.get('/api/reference/plan-limits', async (_request, reply) => {
    const limits = await getSetting(SETTING_KEYS.PLAN_LIMITS)
    return reply.send({ limits })
  })
}
