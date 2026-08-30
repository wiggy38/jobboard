import type { FastifyInstance } from 'fastify'
import { SETTING_KEYS } from '@tumaa/shared'
import { getSetting } from '../lib/settings'

// Référentiels villes/secteurs/niveaux — édités en backoffice (voir
// routes/admin/settings.ts), consommés publiquement par le formulaire
// d'abonnement (apps/web) et par le formulaire employeur (apps/backoffice).
export async function referenceRoutes(fastify: FastifyInstance) {
  fastify.get('/api/reference/options', async (_request, reply) => {
    // apps/home est servi sur une origine distincte (WAMP), non proxifiée vers
    // l'API — même en-tête CORS que plan-limits/plan-pricing.
    reply.header('Access-Control-Allow-Origin', '*')
    const [levels, sectors, citiesByCountry] = await Promise.all([
      getSetting(SETTING_KEYS.REFERENCE_LEVELS),
      getSetting(SETTING_KEYS.REFERENCE_SECTORS),
      getSetting(SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY),
    ])

    return reply.send({ levels, sectors, citiesByCountry })
  })

  // Limites de plan effectives (défaut PLAN_LIMITS, ou surcharge backoffice
  // via SETTING_KEYS.PLAN_LIMITS) — consommées publiquement par /subscribe
  // (apps/web) et apps/home pour ne jamais afficher des chiffres obsolètes.
  fastify.get('/api/reference/plan-limits', async (_request, reply) => {
    // apps/home est servi sur une origine distincte (WAMP), non proxifiée vers
    // l'API — même en-tête CORS que plan-pricing.
    reply.header('Access-Control-Allow-Origin', '*')
    const limits = await getSetting(SETTING_KEYS.PLAN_LIMITS)
    return reply.send({ limits })
  })

  // Prix (barré + réel) par plan — défaut PLAN_PRICING, ou surcharge backoffice
  // via SETTING_KEYS.PLAN_PRICING — consommés publiquement par apps/web et
  // apps/home pour ne jamais afficher un tarif obsolète. Inclut aussi le mode
  // PayDunya (test/live, SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE) pour que
  // /subscribe (apps/web) puisse n'afficher le bouton "Simuler le paiement"
  // que lorsque PayDunya est en mode Test — voir SubscribePage.tsx.
  fastify.get('/api/reference/plan-pricing', async (_request, reply) => {
    // apps/home est servi sur une origine distincte (WAMP), non proxifiée vers
    // l'API — même en-tête CORS que les autres endpoints publics qu'il
    // consomme (voir offre.routes.ts: whatsapp-number, offres, offre/:id).
    reply.header('Access-Control-Allow-Origin', '*')
    const [pricing, paydunyaMode] = await Promise.all([
      getSetting(SETTING_KEYS.PLAN_PRICING),
      getSetting(SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE),
    ])
    return reply.send({ pricing, paydunyaMode })
  })
}
