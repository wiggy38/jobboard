import { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    // Accepter Bearer token (appels directs) OU cookie de session (dashboard)
    const auth = (req.headers['authorization'] as string) ?? ''
    const cookie = (req.headers['cookie'] as string) ?? ''
    const sessionMatch = cookie.match(/tumaa_admin_session=([^;]+)/)
    const sessionToken = sessionMatch?.[1] ?? ''
    const secret = process.env.ADMIN_SECRET ?? ''

    const validBearer = !!secret && auth === `Bearer ${secret}`
    const validCookie = !!secret && sessionToken === secret

    if (!validBearer && !validCookie) {
      return reply.status(401).send({ error: 'Non autorisé' })
    }
  })

  app.get('/admin/stats', async (_req, reply) => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      activeUsers,
      totalOffers,
      pendingOffers,
      activeOffers,
      expiredOffers,
      archivedOffers,
      offersInsertedToday,
      templatesSent,
      dailyHistory,
    ] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.jobOffer.count(),
      prisma.jobOffer.count({ where: { status: 'PENDING' } }),
      prisma.jobOffer.count({ where: { status: 'ACTIVE' } }),
      prisma.jobOffer.count({ where: { status: 'EXPIRED' } }),
      prisma.jobOffer.count({ where: { status: 'ARCHIVED' } }),
      prisma.jobOffer.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.templateCounter.aggregate({
        _sum: { count: true },
        where: { month: getCurrentMonth() },
      }),
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
        FROM "JobOffer"
        WHERE "createdAt" >= NOW() - INTERVAL '10 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ])

    const pullsToday = await prisma.pullEvent.count({ where: { date: todayStart } })
    const tpqToday = Math.round((pullsToday / (activeUsers || 1)) * 100)

    return reply.send({
      activeUsers,
      tpqToday,
      totalOffers,
      pendingOffers,
      activeOffers,
      expiredOffers,
      archivedOffers,
      offersInsertedToday,
      templatesSentThisMonth: templatesSent._sum.count ?? 0,
      templateBudgetCap: activeUsers * 3,
      offersDailyHistory: dailyHistory.map((r) => ({
        date: String(r.date),
        count: Number(r.count),
      })),
    })
  })

  app.get('/admin/scrapers', async (_req, reply) => {
    const sources = await prisma.source.findMany({
      where: { isActive: true },
      orderBy: { crawlErrors: 'desc' },
    })
    return reply.send(
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        lastCrawl: s.lastCrawled?.toISOString() ?? null,
        newOffers: 0,
        consecutiveErrors: s.crawlErrors,
        status: s.crawlErrors === 0 ? 'ok' : s.crawlErrors < 3 ? 'warn' : 'error',
      })),
    )
  })

  app.get('/admin/templates/usage', async (_req, reply) => {
    const month = getCurrentMonth()
    const activeUsers = await prisma.user.count({ where: { status: 'ACTIVE' } })

    const counters = await prisma.templateCounter.groupBy({
      by: ['type'],
      _sum: { count: true },
      where: { month },
    })

    const usageMap = new Map(counters.map((c) => [c.type, c._sum.count ?? 0]))
    const types = ['RELANCE', 'MATCH_PARFAIT', 'NUDGE_PREMIUM'] as const

    return reply.send(
      types.map((type) => ({
        type,
        used: usageMap.get(type) ?? 0,
        cap: activeUsers,
      })),
    )
  })

  app.get('/admin/templates/logs', async (_req, reply) => {
    const logs = await prisma.notification.findMany({
      where: { isPaid: true },
      orderBy: { sentAt: 'desc' },
      take: 100,
      include: { user: { select: { phone: true } } },
    })
    return reply.send(
      logs.map((n) => ({
        id: n.id,
        phoneNumber: n.user.phone,
        type: n.templateType ?? n.type,
        sentAt: n.sentAt.toISOString(),
        status: n.status,
      })),
    )
  })

  app.get('/admin/offers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const offer = await prisma.jobOffer.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, url: true, type: true, trustScore: true } },
        interactions: {
          select: { action: true },
        },
      },
    })
    if (!offer) return reply.status(404).send({ error: 'Offre introuvable' })

    const interactionCounts = offer.interactions.reduce<Record<string, number>>((acc, i) => {
      acc[i.action] = (acc[i.action] ?? 0) + 1
      return acc
    }, {})

    return reply.send({
      ...offer,
      deadline: offer.deadline?.toISOString() ?? null,
      publishedAt: offer.publishedAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
      interactions: interactionCounts,
    })
  })

  app.patch('/admin/offers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = req.body as Record<string, any>

    const editableFields = [
      'title', 'organization', 'city', 'sector', 'level', 'contractType',
      'description', 'requirements', 'contactEmail', 'contactPhone',
      'contactAddress', 'applicationUrl', 'isSponsored', 'isFraudSuspect',
      'validated', 'ttlDays',
    ]

    const data: Record<string, any> = {}
    for (const key of editableFields) {
      if (key in b) data[key] = b[key]
    }

    if ('deadline' in b) {
      data.deadline = b.deadline ? new Date(b.deadline as string) : null
    }

    if ('status' in b) {
      const valid = ['PENDING', 'ACTIVE', 'EXPIRED', 'ARCHIVED']
      if (!valid.includes(b.status)) {
        return reply.status(400).send({ error: 'Statut invalide' })
      }
      data.status = b.status
    }

    try {
      const updated = await prisma.jobOffer.update({ where: { id }, data })
      return reply.send({ ok: true, id: updated.id })
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: 'Erreur serveur lors de la mise à jour' })
    }
  })

  // ── Scrapers : relancer ──────────────────────────────────────────────
  app.post('/admin/scrapers/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string }
    const source = await prisma.source.findUnique({ where: { id }, select: { name: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })

    const jobId = `manual-${source.name}-${Date.now()}`
    const queue = new Queue('scraper', { connection: redis })
    await queue.add('manual-run', { scraperKey: source.name }, { jobId })
    await queue.close()

    return reply.send({ jobId })
  })

  // ── Jobs : état ──────────────────────────────────────────────────────
  app.get('/admin/jobs/:jobId', async (req, reply) => {
    const { jobId } = req.params as { jobId: string }
    const queue = new Queue('scraper', { connection: redis })
    const job = await queue.getJob(jobId)
    await queue.close()

    if (!job) return reply.status(404).send({ error: 'Job introuvable' })

    const state = await job.getState()
    return reply.send({
      state,
      result: state === 'completed' ? job.returnvalue : null,
      failedReason: state === 'failed' ? job.failedReason : null,
    })
  })

  // ── Scrapers : désactiver/réactiver ─────────────────────────────────
  app.post('/admin/scrapers/:id/disable', async (req, reply) => {
    const { id } = req.params as { id: string }
    const source = await prisma.source.findUnique({ where: { id }, select: { isActive: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })

    await prisma.source.update({ where: { id }, data: { isActive: !source.isActive } })
    return reply.send({ ok: true, isActive: !source.isActive })
  })

  // ── Scrapers : sync tous ─────────────────────────────────────────────
  app.post('/admin/scrapers/sync', async (_req, reply) => {
    const sources = await prisma.source.findMany({ where: { isActive: true }, select: { name: true } })
    const queue = new Queue('scraper', { connection: redis })
    await Promise.all(
      sources.map((s) =>
        queue.add('manual-run', { scraperKey: s.name }, { jobId: `manual-${s.name}-${Date.now()}` }),
      ),
    )
    await queue.close()
    return reply.send({ ok: true, queued: sources.length })
  })

  app.get('/admin/offers', async (req, reply) => {
    const q = req.query as {
      page?: string
      title?: string
      source?: string
      status?: string
      sector?: string
      score?: string
      date?: string
    }
    const pageNum = Math.max(1, parseInt(q.page ?? '1', 10))
    const pageSize = 20

    const where: Record<string, any> = {}
    if (q.title) where.title = { contains: q.title, mode: 'insensitive' }
    if (q.source) where.sourceId = q.source
    if (q.status) where.status = q.status
    if (q.sector) where.sector = { contains: q.sector, mode: 'insensitive' }
    if (q.score) where.scoreConfidence = { gte: Number(q.score) / 100 }
    if (q.date) {
      const dayStart = new Date(q.date)
      const dayEnd = new Date(q.date)
      dayEnd.setDate(dayEnd.getDate() + 1)
      where.createdAt = { gte: dayStart, lt: dayEnd }
    }

    const [total, offers] = await Promise.all([
      prisma.jobOffer.count({ where }),
      prisma.jobOffer.findMany({
        where,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          organization: true,
          city: true,
          sector: true,
          level: true,
          contractType: true,
          status: true,
          scoreConfidence: true,
          deadline: true,
          publishedAt: true,
          isSponsored: true,
        },
      }),
    ])
    return reply.send({
      offers: offers.map((o) => ({
        ...o,
        deadline: o.deadline?.toISOString() ?? null,
        publishedAt: o.publishedAt?.toISOString() ?? null,
      })),
      total,
      page: pageNum,
      perPage: pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  })
}
