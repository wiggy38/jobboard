import type { FastifyInstance } from 'fastify'
import { UserPlan } from '@prisma/client'
import { prisma } from './lib/prisma'
import { COUNTRY_NAMES, ELITE_MAX_COUNTRIES, NATIONAL_CHANNELS, getChannelInviteLink } from './lib/country'

const PLAN_PRICING: Record<'PREMIUM' | 'ELITE', number> = {
  PREMIUM: 650,
  ELITE: 1250,
}
const SUBSCRIPTION_DURATION_DAYS = 30

function verifySubscribeToken(fastify: FastifyInstance, token: string): { userId: string } {
  const payload = fastify.jwt.verify<{ userId: string; purpose?: string }>(token)
  if (payload.purpose !== 'subscribe') {
    throw new Error('TOKEN_INVALID')
  }
  return { userId: payload.userId }
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

    const now = new Date()
    const planEndAt = new Date(now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000)

    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: PLAN_PRICING[plan],
        provider: 'CINETPAY',
        reference: `SIMULATED-${Date.now()}`,
        status: 'SUCCESS',
        planPurchased: plan as UserPlan,
        durationDays: SUBSCRIPTION_DURATION_DAYS,
      },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { plan: plan as UserPlan, planStartAt: now, planEndAt },
    })

    const redirectUrl = plan === 'ELITE' ? `/subscribe/countries?t=${t}` : `/subscribe/success?plan=${plan}`

    return reply.send({ ok: true, plan, redirectUrl })
  })

  // Retourne les pays déjà rejoints (ChannelJoin) pour pré-sélectionner le
  // formulaire quand l'utilisateur revient sur la page (ex. après un ELITE
  // renouvelé ou un rechargement de page).
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

    const joins = await prisma.channelJoin.findMany({ where: { userId }, select: { country: true } })

    return reply.send({ ok: true, countries: joins.map((j) => j.country) })
  })

  // Enregistre le choix des pays ELITE (jusqu'à 3) après paiement — équivalent
  // web de la commande WhatsApp PAYS (apps/bot/src/commands/handlers/pays.ts).
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

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }
    if (user.plan !== 'ELITE') {
      return reply.status(403).send({ error: 'NOT_ELITE' })
    }

    const selected = [...new Set(countries ?? [])]
    if (selected.length === 0 || selected.length > ELITE_MAX_COUNTRIES) {
      return reply.status(400).send({ error: 'COUNTRIES_INVALID' })
    }
    if (selected.some((code) => !(code in COUNTRY_NAMES))) {
      return reply.status(400).send({ error: 'COUNTRIES_INVALID' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { countries: selected } })

    // Retire les canaux des pays désélectionnés — sinon un ChannelJoin périmé
    // reste en base après un changement de sélection (ex. ancien pays retiré
    // au profit d'un nouveau).
    await prisma.channelJoin.deleteMany({
      where: { userId: user.id, country: { notIn: selected } },
    })

    const channels = await Promise.all(
      selected.map(async (country) => {
        await prisma.channelJoin.upsert({
          where: { userId_country: { userId: user.id, country } },
          update: {},
          create: { userId: user.id, country },
        })
        return {
          country,
          name: COUNTRY_NAMES[country],
          channel: NATIONAL_CHANNELS[country],
          inviteLink: getChannelInviteLink(country) ?? null,
        }
      }),
    )

    return reply.send({ ok: true, countries: selected, channels })
  })
}
