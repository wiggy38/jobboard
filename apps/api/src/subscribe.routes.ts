import type { FastifyInstance } from 'fastify'
import { UserPlan } from '@prisma/client'
import { prisma } from './lib/prisma'
import { COUNTRY_NAMES, NATIONAL_CHANNELS, getChannelInviteLink, getCountryFromPhone } from './lib/country'
import { createInvoice, confirmInvoice } from './lib/paydunya'
import { sendText } from './lib/whatsapp'
import { applyPlanLimits } from './lib/planLimits'
import { getSetting } from './lib/settings'
import {
  isUnlimited,
  SETTING_KEYS,
  CONTRACT_GROUPS,
  ContractGroupId,
} from '@tumaa/shared'

const PLAN_PRICING: Record<'PREMIUM' | 'ELITE', number> = {
  PREMIUM: 650,
  ELITE: 1250,
}
const PLAN_LABELS: Record<'PREMIUM' | 'ELITE', string> = {
  PREMIUM: 'Abonnement Tumaa PREMIUM (30 jours)',
  ELITE: 'Abonnement Tumaa ELITE (30 jours)',
}
const SUBSCRIPTION_DURATION_DAYS = 30
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000'

function verifySubscribeToken(fastify: FastifyInstance, token: string): { userId: string } {
  const payload = fastify.jwt.verify<{ userId: string; purpose?: string }>(token)
  if (payload.purpose !== 'subscribe') {
    throw new Error('TOKEN_INVALID')
  }
  return { userId: payload.userId }
}

function getPlanRedirectUrl(plan: 'PREMIUM' | 'ELITE', t: string): string {
  return `${WEB_BASE_URL}/subscribe/profile?t=${t}&plan=${plan}`
}

async function activateSubscription(userId: string, plan: 'PREMIUM' | 'ELITE'): Promise<void> {
  const now = new Date()
  const planEndAt = new Date(now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.user.update({
    where: { id: userId },
    data: { plan: plan as UserPlan, planStartAt: now, planEndAt },
  })
  await applyPlanLimits(prisma, userId, plan as UserPlan)
}

// Récap envoyé sur WhatsApp une fois le wizard /subscribe/profile terminé
// (dernière étape pour tous les plans : /api/subscribe/join-channel) —
// confirme les choix de l'abonné avant qu'il ne tape OFFRES.
function buildOnboardingRecap(
  plan: UserPlan,
  profile: { cities: string[]; sectors: string[]; levels: string[]; contractTypes: string[] },
  countries: string[],
): string {
  const lines = [
    '✅ *Ton profil Tumaa est prêt !*',
    '',
    `📍 Villes : *${profile.cities.join(', ')}*`,
    `💼 Secteurs : *${profile.sectors.join(', ')}*`,
    `🎓 Niveau : *${profile.levels.join(', ')}*`,
    `📋 Contrat : *${profile.contractTypes.join(', ')}*`,
  ]

  if (plan === 'ELITE' && countries.length > 0) {
    lines.push(`🌍 Pays de recherche : *${countries.map((c) => COUNTRY_NAMES[c] ?? c).join(', ')}*`)
  }

  lines.push('', '👉 Tape *OFFRES* pour recevoir tes premières offres !')

  return lines.join('\n')
}

export async function subscribeRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { t?: string; plan?: UserPlan }
  }>('/api/subscribe/track', async (request, reply) => {
    const { t, plan } = request.body ?? {}

    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let payload: { userId: string; purpose?: string }
    try {
      payload = fastify.jwt.verify<{ userId: string; purpose?: string }>(t)
    } catch {
      return reply.status(401).send({
        error: 'TOKEN_EXPIRED',
        message: 'Lien expiré ou invalide',
      })
    }

    if (payload.purpose !== 'subscribe') {
      return reply.status(401).send({ error: 'TOKEN_INVALID' })
    }

    if (plan && plan !== UserPlan.PREMIUM && plan !== UserPlan.ELITE) {
      return reply.status(400).send({ error: 'PLAN_INVALID' })
    }

    const click = await prisma.subscribeClick.create({
      data: { userId: payload.userId, plan: plan ?? null },
    })

    return reply.send({ ok: true, id: click.id })
  })

  // Enregistre le profil de recherche (villes/secteurs/type de contrat/niveau
  // d'étude) depuis le wizard /subscribe/profile — équivalent web de l'ancien
  // onboarding ville/secteur/contrat sur WhatsApp (retiré, voir onboarding.ts).
  // Les plafonds (maxCities/maxSectors/maxLevels/maxContractGroups) sont lus
  // depuis Profile — jamais recalculés depuis user.plan (voir applyPlanLimits).
  fastify.post<{
    Body: {
      t?: string
      cities?: string[]
      sectors?: string[]
      contractGroups?: ContractGroupId[]
      levels?: string[]
    }
  }>('/api/subscribe/profile', async (request, reply) => {
    const { t, cities, sectors, contractGroups, levels } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } })
    if (!user || !user.profile) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    const { maxCities, maxSectors, maxLevels, maxContractGroups, country } = user.profile

    const [citiesByCountry, sectorOptions, levelOptions] = await Promise.all([
      getSetting(SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY),
      getSetting(SETTING_KEYS.REFERENCE_SECTORS),
      getSetting(SETTING_KEYS.REFERENCE_LEVELS),
    ])
    const cityOptions = citiesByCountry[country] ?? []

    const withinBounds = (selected: unknown[] | undefined, max: number): selected is unknown[] =>
      Array.isArray(selected) && selected.length >= 1 && (isUnlimited(max) || selected.length <= max)

    const citiesValid =
      withinBounds(cities, maxCities) && cities!.every((c) => cityOptions.some((o) => o.value === c))
    const sectorsValid =
      withinBounds(sectors, maxSectors) && sectors!.every((s) => sectorOptions.some((o) => o.value === s))
    const levelsValid =
      withinBounds(levels, maxLevels) && levels!.every((l) => levelOptions.some((o) => o.value === l))
    const contractGroupsValid =
      withinBounds(contractGroups, maxContractGroups) &&
      contractGroups!.every((g) => g in CONTRACT_GROUPS)

    if (!citiesValid || !sectorsValid || !levelsValid || !contractGroupsValid) {
      return reply.status(400).send({ error: 'PROFILE_INVALID' })
    }

    const contractTypes = [
      ...new Set(contractGroups!.flatMap((g) => CONTRACT_GROUPS[g].types)),
    ]

    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        cities: cities as string[],
        sectors: sectors as string[],
        levels: levels as string[],
        contractTypes,
      },
    })

    return reply.send({ ok: true })
  })

  // Rejoint le canal WhatsApp national de l'abonné — déterminé uniquement
  // depuis l'indicatif de son numéro, jamais depuis les pays de recherche
  // ELITE (qui n'ont aucun lien avec les canaux). Idempotent : un seul
  // ChannelJoin par utilisateur, nettoie tout ancien ChannelJoin d'un autre
  // pays (ex. abonné qui aurait changé de numéro).
  fastify.post<{
    Body: { t?: string }
  }>('/api/subscribe/join-channel', async (request, reply) => {
    const { t } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    const country = getCountryFromPhone(user.phone)

    await prisma.channelJoin.deleteMany({ where: { userId: user.id, country: { not: country } } })
    await prisma.channelJoin.upsert({
      where: { userId_country: { userId: user.id, country } },
      update: {},
      create: { userId: user.id, country },
    })

    if (user.profile) {
      await sendText(user.phone, buildOnboardingRecap(user.plan, user.profile, user.countries))
    }

    return reply.send({
      ok: true,
      channel: {
        country,
        name: COUNTRY_NAMES[country],
        channel: NATIONAL_CHANNELS[country],
        inviteLink: (await getChannelInviteLink(country)) ?? null,
      },
    })
  })

  // Confirme qu'un abonné a effectivement cliqué sur le lien d'invitation de
  // son canal — appelé par le front au clic sur "Rejoindre" (JoinChannelScreen).
  // Seul signal disponible : Meta ne notifie jamais le join effectif côté
  // serveur. Alimente ChannelJoin.joined pour permettre au backoffice de
  // relancer les abonnés qui n'ont pas rejoint leur canal.
  fastify.post<{
    Body: { t?: string }
  }>('/api/subscribe/channel-joined', async (request, reply) => {
    const { t } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    const country = getCountryFromPhone(user.phone)
    const now = new Date()

    await prisma.channelJoin.upsert({
      where: { userId_country: { userId: user.id, country } },
      update: { joined: true, joinedAt: now },
      create: { userId: user.id, country, joined: true, joinedAt: now },
    })

    return reply.send({ ok: true })
  })

  // Simule un paiement réussi (dev/démo uniquement — aucun provider réel n'est
  // encore intégré, voir docs/subscription_flow_elite.md). Crée un Payment
  // SUCCESS, active le plan, et indique où rediriger ensuite (choix des pays
  // pour ELITE).
  fastify.post<{
    Body: { t?: string; plan?: 'PREMIUM' | 'ELITE' }
  }>('/api/subscribe/simulate-payment', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'SIMULATION_DISABLED' })
    }

    const { t, plan } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }
    if (plan !== 'PREMIUM' && plan !== 'ELITE') {
      return reply.status(400).send({ error: 'PLAN_INVALID' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: PLAN_PRICING[plan],
        provider: 'PAYDUNYA',
        reference: `SIMULATED-${Date.now()}`,
        status: 'SUCCESS',
        planPurchased: plan as UserPlan,
        durationDays: SUBSCRIPTION_DURATION_DAYS,
      },
    })

    await activateSubscription(user.id, plan)

    const redirectUrl = `/profile?t=${t}&plan=${plan}`

    return reply.send({ ok: true, plan, redirectUrl })
  })

  // Initie un paiement PayDunya réel : crée un Payment PENDING, crée la facture
  // PayDunya (Checkout Invoice API), renvoie l'URL de paiement vers laquelle
  // rediriger l'utilisateur. L'activation du plan se fait via le webhook
  // /api/subscribe/paydunya/webhook une fois le paiement confirmé.
  fastify.post<{
    Body: { t?: string; plan?: 'PREMIUM' | 'ELITE' }
  }>('/api/subscribe/pay', async (request, reply) => {
    const { t, plan } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }
    if (plan !== 'PREMIUM' && plan !== 'ELITE') {
      return reply.status(400).send({ error: 'PLAN_INVALID' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        amount: PLAN_PRICING[plan],
        provider: 'PAYDUNYA',
        status: 'PENDING',
        planPurchased: plan as UserPlan,
        durationDays: SUBSCRIPTION_DURATION_DAYS,
      },
    })

    try {
      const invoice = await createInvoice({
        amount: PLAN_PRICING[plan],
        description: PLAN_LABELS[plan],
        customData: { paymentId: payment.id, userId: user.id, plan },
        returnUrl: getPlanRedirectUrl(plan, t),
        cancelUrl: `${WEB_BASE_URL}/subscribe?t=${t}`,
        callbackUrl: `${API_BASE_URL}/api/subscribe/paydunya/webhook`,
      })

      await prisma.payment.update({ where: { id: payment.id }, data: { reference: invoice.token } })

      return reply.send({ ok: true, paymentUrl: invoice.invoiceUrl })
    } catch (err) {
      fastify.log.error(err, 'PayDunya invoice creation failed')
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
      return reply.status(502).send({ error: 'PAYMENT_INIT_FAILED' })
    }
  })

  // Webhook IPN PayDunya (application/x-www-form-urlencoded). Ne fait jamais
  // confiance au corps du webhook pour le statut : reconfirme systématiquement
  // via l'API PayDunya (confirmInvoice), seule source authentifiée. Idempotent.
  fastify.post<{
    Body: { data?: string; token?: string }
  }>('/api/subscribe/paydunya/webhook', async (request, reply) => {
    const body = request.body ?? {}
    let invoiceToken = body.token

    if (body.data) {
      try {
        const parsed = JSON.parse(body.data) as { token?: string; invoice?: { token?: string } }
        invoiceToken = parsed.token ?? parsed.invoice?.token ?? invoiceToken
      } catch {
        // ignore, on retombe sur body.token s'il existe
      }
    }

    if (!invoiceToken) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let confirmed: Awaited<ReturnType<typeof confirmInvoice>>
    try {
      confirmed = await confirmInvoice(invoiceToken)
    } catch (err) {
      fastify.log.error(err, 'PayDunya confirmInvoice failed')
      return reply.status(200).send({ ok: true })
    }

    const paymentId = confirmed.customData.paymentId
    const payment = paymentId
      ? await prisma.payment.findUnique({ where: { id: paymentId } })
      : await prisma.payment.findFirst({ where: { reference: invoiceToken } })

    if (!payment) {
      fastify.log.warn({ invoiceToken }, 'PayDunya webhook: payment not found')
      return reply.status(200).send({ ok: true })
    }

    if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
      return reply.status(200).send({ ok: true })
    }

    if (confirmed.status === 'completed') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS' } })
      await activateSubscription(payment.userId, payment.planPurchased as 'PREMIUM' | 'ELITE')
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    }

    return reply.status(200).send({ ok: true })
  })

  // Retourne les pays de recherche déjà choisis (User.countries) pour
  // pré-sélectionner le formulaire quand l'utilisateur revient sur la page
  // (ex. après un ELITE renouvelé ou un rechargement de page).
  fastify.get<{
    Querystring: { t?: string }
  }>('/api/subscribe/countries', async (request, reply) => {
    const { t } = request.query ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { countries: true } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }

    return reply.send({ ok: true, countries: user.countries.filter((c) => c in COUNTRY_NAMES) })
  })

  // Enregistre le choix des pays de recherche ELITE (jusqu'à 3) après paiement
  // — équivalent web de la commande WhatsApp PAYS
  // (apps/bot/src/commands/handlers/pays.ts). Ces pays servent uniquement au
  // matching d'offres (User.countries) — ils n'ont plus d'effet sur les
  // canaux WhatsApp, voir /api/subscribe/join-channel.
  fastify.post<{
    Body: { t?: string; countries?: string[] }
  }>('/api/subscribe/countries', async (request, reply) => {
    const { t, countries } = request.body ?? {}
    if (!t) {
      return reply.status(400).send({ error: 'TOKEN_MISSING' })
    }

    let userId: string
    try {
      ;({ userId } = verifySubscribeToken(fastify, t))
    } catch {
      return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Lien expiré ou invalide' })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }
    if (user.plan !== 'ELITE') {
      return reply.status(403).send({ error: 'NOT_ELITE' })
    }

    const maxCountries = user.profile?.maxCountries ?? 1
    const selected = [...new Set(countries ?? [])]
    if (selected.length === 0 || selected.length > maxCountries) {
      return reply.status(400).send({ error: 'COUNTRIES_INVALID' })
    }
    if (selected.some((code) => !(code in COUNTRY_NAMES))) {
      return reply.status(400).send({ error: 'COUNTRIES_INVALID' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { countries: selected } })

    return reply.send({ ok: true, countries: selected })
  })
}
