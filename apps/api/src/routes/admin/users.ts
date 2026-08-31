import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { adminAuth, requireRole } from '../../middleware/adminAuth'
import { ACTION_COLUMN_MAP, buildInteractionEventsUnion, type InteractionAction } from '../../lib/jobInteractionEvents'

export async function userRoutes(fastify: FastifyInstance) {
  // GET /admin/users
  fastify.get('/admin/users', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      plan?: string
      status?: string
      country?: string
      phone?: string
      channelJoined?: string
      page?: string
      limit?: string
    }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const where: Record<string, any> = {}
    if (q.plan) where.plan = q.plan
    if (q.status) where.status = q.status
    if (q.country) where.countries = { has: q.country }
    if (q.phone) where.phone = { contains: q.phone, mode: 'insensitive' }
    // channelJoined=false → à relancer (jamais cliqué sur l'invitation canal)
    if (q.channelJoined === 'true') where.channelJoins = { some: { joined: true } }
    if (q.channelJoined === 'false') where.channelJoins = { none: { joined: true } }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { channelJoins: true },
      }),
      prisma.user.count({ where }),
    ])

    return reply.send({ data, total })
  })

  // GET /admin/users/:id
  fastify.get('/admin/users/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        channelJoins: true,
      },
    })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    return reply.send(user)
  })

  // GET /admin/users/pull-activity
  // Liste des abonnés avec leur activité de pull (commande OFFRES/SUITE) sur une
  // période donnée : nombre de jours pullés, nombre d'offres reçues, dernière date
  // de pull. Permet de distinguer les abonnés actifs sur la boucle pull de ceux
  // qui n'ont jamais pullé.
  fastify.get('/admin/users/pull-activity', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      from?: string
      to?: string
      pulled?: string // 'true' | 'false' | undefined (tous)
      plan?: string
      status?: string
      phone?: string
      page?: string
      limit?: string
    }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const from = q.from ? new Date(q.from) : defaultFrom
    const to = q.to ? new Date(q.to) : now
    const fromDate = new Date(from.toISOString().split('T')[0])
    const toDate = new Date(to.toISOString().split('T')[0])

    // Utilisateurs ayant au moins un pull dans la période
    const pulledEvents = await prisma.pullEvent.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { userId: true },
      distinct: ['userId'],
    })
    const pulledIds = pulledEvents.map((e) => e.userId)

    const where: Record<string, any> = {}
    if (q.plan) where.plan = q.plan
    if (q.status) where.status = q.status
    if (q.phone) where.phone = { contains: q.phone, mode: 'insensitive' }
    if (q.pulled === 'true') where.id = { in: pulledIds }
    if (q.pulled === 'false') where.id = { notIn: pulledIds }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          displayName: true,
          plan: true,
          status: true,
          countries: true,
          createdAt: true,
        },
      }),
    ])

    const userIds = users.map((u) => u.id)
    const stats = userIds.length
      ? await prisma.pullEvent.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDate } },
          _sum: { offersCount: true },
          _count: { _all: true },
          _max: { date: true },
        })
      : []
    const statsMap = new Map(stats.map((s) => [s.userId, s]))

    return reply.send({
      data: users.map((u) => {
        const s = statsMap.get(u.id)
        return {
          ...u,
          createdAt: u.createdAt.toISOString(),
          pullDaysCount: s?._count._all ?? 0,
          offersReceived: s?._sum.offersCount ?? 0,
          lastPullDate: s?._max.date?.toISOString() ?? null,
        }
      }),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    })
  })

  // GET /admin/users/:id/pull-history
  // Historique détaillé des pulls (chaque exécution de OFFRES/SUITE) d'un abonné,
  // avec pour chacun la liste précise des offres envoyées.
  fastify.get('/admin/users/:id/pull-history', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = request.query as { page?: string; limit?: string; from?: string; to?: string }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const createdAt: { gte?: Date; lte?: Date } = {}
    if (q.from) createdAt.gte = new Date(`${q.from}T00:00:00.000Z`)
    if (q.to) createdAt.lte = new Date(`${q.to}T23:59:59.999Z`)

    const where = { userId: id, ...(q.from || q.to ? { createdAt } : {}) }

    const [total, deliveries] = await Promise.all([
      prisma.pullDelivery.count({ where }),
      prisma.pullDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          command: true,
          offersCount: true,
          createdAt: true,
          planAtPull: true,
          offers: {
            select: {
              id: true,
              title: true,
              organization: true,
              city: true,
              sector: true,
              contractType: true,
              status: true,
              source: { select: { type: true } },
            },
          },
        },
      }),
    ])

    const jobIds = [...new Set(deliveries.flatMap((d) => d.offers.map((o) => o.id)))]
    const interactions = jobIds.length
      ? await prisma.jobInteraction.findMany({
          where: { userId: id, jobId: { in: jobIds } },
          select: { jobId: true, seenAt: true, clickedSourceAt: true, sharedAt: true },
        })
      : []
    const seenAt = new Map(interactions.filter((i) => i.seenAt).map((i) => [i.jobId, i.seenAt!.toISOString()]))
    const clickedAt = new Map(interactions.filter((i) => i.clickedSourceAt).map((i) => [i.jobId, i.clickedSourceAt!.toISOString()]))
    const sharedAt = new Map(interactions.filter((i) => i.sharedAt).map((i) => [i.jobId, i.sharedAt!.toISOString()]))

    return reply.send({
      data: deliveries.map((d) => {
        const effectivePlan = d.planAtPull ?? 'PREMIUM'
        return {
          id: d.id,
          command: d.command,
          offersCount: d.offersCount,
          createdAt: d.createdAt.toISOString(),
          offers: d.offers.map(({ source, ...o }) => ({
            ...o,
            seenAt: seenAt.get(o.id) ?? null,
            sourceClickedAt: clickedAt.get(o.id) ?? null,
            sharedAt: sharedAt.get(o.id) ?? null,
            unlocked: source.type === 'B2B_DIRECT' || effectivePlan !== 'FREEMIUM',
          })),
        }
      }),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
    })
  })

  // GET /admin/users/:id/referrals
  // Liste paginée des utilisateurs inscrits via le code de parrainage de cet
  // abonné (User.referredById) — pour chacun, indique si le profil est
  // renseigné (villes + secteurs non vides) et l'éventuel plan souscrit
  // (dernier paiement SUCCESS). Pas de mécanique de récompense pour l'instant.
  fastify.get('/admin/users/:id/referrals', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = request.query as { page?: string; limit?: string }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const where = { referredById: id }

    const [total, referrals] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          displayName: true,
          plan: true,
          status: true,
          createdAt: true,
          profile: { select: { cities: true, sectors: true } },
          payments: {
            where: { status: 'SUCCESS' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { planPurchased: true, createdAt: true },
          },
        },
      }),
    ])

    return reply.send({
      data: referrals.map((u) => ({
        id: u.id,
        phone: u.phone,
        displayName: u.displayName,
        plan: u.plan,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        profileCompleted: !!u.profile && u.profile.cities.length > 0 && u.profile.sectors.length > 0,
        subscribedPlan: u.payments[0]?.planPurchased ?? null,
        subscribedAt: u.payments[0]?.createdAt.toISOString() ?? null,
      })),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
    })
  })

  // GET /admin/tracking
  // Liste paginée des événements de tracking d'offres (SEEN = ouverture de la
  // page offre tokenisée, CLICKED_SOURCE = clic sortant vers la source) sur
  // une période donnée, avec un résumé agrégé (vues, clics, taux de clic).
  fastify.get('/admin/tracking', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      from?: string
      to?: string
      action?: string
      jobTitle?: string
      page?: string
      limit?: string
    }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const from = q.from ? new Date(q.from) : defaultFrom
    const to = q.to ? new Date(q.to) : now
    const fromDate = new Date(from.toISOString().split('T')[0])
    const toDate = new Date(to.toISOString().split('T')[0])
    toDate.setHours(23, 59, 59, 999)

    // Par défaut SEEN+CLICKED_SOURCE (comportement historique) ; q.action
    // restreint à une seule action et court-circuite l'UNION — validé contre
    // la whitelist ACTION_COLUMN_MAP, jamais interpolé tel quel dans le SQL.
    let actions: InteractionAction[]
    if (q.action) {
      if (!(q.action in ACTION_COLUMN_MAP)) {
        return reply.status(400).send({ error: 'INVALID_ACTION', message: 'Action inconnue' })
      }
      actions = [q.action as InteractionAction]
    } else {
      actions = ['SEEN', 'CLICKED_SOURCE']
    }

    const params: unknown[] = [fromDate, toDate]
    let jobTitleClause = ''
    if (q.jobTitle) {
      params.push(`%${q.jobTitle}%`)
      jobTitleClause = `AND j.title ILIKE $${params.length}`
    }

    const eventsUnion = buildInteractionEventsUnion(actions)
    const baseFrom = `
      FROM (${eventsUnion}) events
      JOIN "User" u ON u.id = events."userId"
      JOIN "JobOffer" j ON j.id = events."jobId"
      WHERE events.event_at BETWEEN $1 AND $2
      ${jobTitleClause}
    `

    const [totalRows, events, seenCountRows, clickCountRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count ${baseFrom}`, ...params),
      prisma.$queryRawUnsafe<
        {
          id: string
          action: InteractionAction
          event_at: Date
          user_id: string
          user_phone: string
          user_displayName: string | null
          job_id: string
          job_title: string
          job_organization: string
        }[]
      >(
        `SELECT events.id, events.action, events.event_at,
                u.id AS user_id, u.phone AS user_phone, u."displayName" AS "user_displayName",
                j.id AS job_id, j.title AS job_title, j.organization AS job_organization
         ${baseFrom}
         ORDER BY events.event_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params,
        limit,
        skip,
      ),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count
         FROM "JobInteraction" ji
         JOIN "JobOffer" j ON j.id = ji."jobId"
         WHERE ji."seenAt" IS NOT NULL AND ji."seenAt" BETWEEN $1 AND $2 ${jobTitleClause}`,
        ...params,
      ),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count
         FROM "JobInteraction" ji
         JOIN "JobOffer" j ON j.id = ji."jobId"
         WHERE ji."clickedSourceAt" IS NOT NULL AND ji."clickedSourceAt" BETWEEN $1 AND $2 ${jobTitleClause}`,
        ...params,
      ),
    ])

    const total = Number(totalRows[0].count)
    const seenCount = Number(seenCountRows[0].count)
    const clickCount = Number(clickCountRows[0].count)

    return reply.send({
      data: events.map((e) => ({
        id: e.id,
        action: e.action,
        createdAt: e.event_at.toISOString(),
        job: { id: e.job_id, title: e.job_title, organization: e.job_organization },
        user: { id: e.user_id, phone: e.user_phone, displayName: e.user_displayName },
      })),
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: {
        views: seenCount,
        clicks: clickCount,
        clickRate: seenCount > 0 ? clickCount / seenCount : 0,
      },
    })
  })

  // PATCH /admin/users/:id/extend
  fastify.patch(
    '/admin/users/:id/extend',
    { preHandler: [adminAuth, requireRole('SUPER_ADMIN', 'ADMIN')] },
    async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { days?: number }

    if (!body.days || body.days <= 0) {
      return reply.status(400).send({ error: 'days must be a positive number' })
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    if (user.plan === 'FREEMIUM') {
      return reply.status(400).send({ error: 'Cannot extend a FREEMIUM user' })
    }

    const now = new Date()
    const base = user.planEndAt && user.planEndAt > now ? user.planEndAt : now
    const planEndAt = new Date(base.getTime() + body.days * 24 * 60 * 60 * 1000)

    await prisma.user.update({ where: { id }, data: { planEndAt } })

      return reply.send({ ok: true, planEndAt })
    },
  )
}
