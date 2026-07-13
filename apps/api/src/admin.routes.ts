import type { FastifyInstance } from 'fastify'
import { Prisma, JobOfferStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import crypto from 'crypto'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin'

export async function adminRoutes(fastify: FastifyInstance) {
  // ── Auth ──────────────────────────────────────────────────────────────
  fastify.post('/admin/login', async (request, reply) => {
    const body = request.body as { password?: string }
    if (!body?.password || body.password !== ADMIN_PASSWORD) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    reply.header('Set-Cookie', 'tumaa_admin_session=1; Path=/; Max-Age=28800; SameSite=Lax')
    return reply.send({ ok: true })
  })

  // ── Scrapers : relancer ──────────────────────────────────────────────
  fastify.post('/admin/scrapers/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string }
    const source = await prisma.source.findUnique({ where: { id }, select: { name: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })

    const jobId = `manual-${source.name}-${Date.now()}`
    const queue = new Queue('scraper', { connection: redis })
    await queue.add('manual-run', { scraperKey: source.name }, { jobId })
    await queue.close()

    return reply.send({ jobId })
  })

  // ── Scrapers : désactiver/réactiver ──────────────────────────────────
  fastify.post('/admin/scrapers/:id/disable', async (request, reply) => {
    const { id } = request.params as { id: string }
    const source = await prisma.source.findUnique({ where: { id }, select: { isActive: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })
    await prisma.source.update({ where: { id }, data: { isActive: !source.isActive } })
    return reply.send({ ok: true, isActive: !source.isActive })
  })

  // ── Scrapers : sync tous ─────────────────────────────────────────────
  fastify.post('/admin/scrapers/sync', async (_request, reply) => {
    let sources: { name: string }[]
    try {
      sources = await prisma.source.findMany({ where: { isActive: true }, select: { name: true } })
    } catch (err) {
      fastify.log.error(err, 'sync/prisma')
      return reply.status(500).send({ error: 'DB inaccessible — vérifie que PostgreSQL tourne et que la migration a été appliquée.' })
    }

    const queue = new Queue('scraper', { connection: redis })
    let jobs: { scraperName: string; jobId: string }[]
    try {
      jobs = await Promise.all(
        sources.map(async (s) => {
          const jobId = `manual-${s.name}-${Date.now()}`
          await queue.add('manual-run', { scraperKey: s.name }, { jobId })
          return { scraperName: s.name, jobId }
        }),
      )
    } catch (err) {
      fastify.log.error(err, 'sync/bullmq')
      return reply.status(500).send({ error: 'Redis inaccessible — lance `docker compose up` pour démarrer Redis.' })
    } finally {
      await queue.close()
    }

    return reply.send({ ok: true, count: sources.length, jobs })
  })

  // ── Scrapers : health check ──────────────────────────────────────────
  fastify.post('/admin/scrapers/health', async (_request, reply) => {
    const STALE_MS = 25 * 60 * 60 * 1000
    const now = new Date()

    const sources = await prisma.source.findMany({
      where: { isActive: true },
      select: { id: true, name: true, crawlErrors: true, lastCrawled: true },
    })

    const alerts: { id: string; name: string; crawlErrors: number; lastCrawled: string | null; reason: string }[] = []
    const staleIds: string[] = []

    for (const s of sources) {
      const isStale = !s.lastCrawled || (now.getTime() - s.lastCrawled.getTime()) > STALE_MS
      if (isStale) staleIds.push(s.id)
      if (isStale || s.crawlErrors > 3) {
        alerts.push({
          id: s.id,
          name: s.name,
          crawlErrors: s.crawlErrors,
          lastCrawled: s.lastCrawled?.toISOString() ?? null,
          reason: isStale ? 'Pas crawlé depuis +25h' : `${s.crawlErrors} erreurs consécutives`,
        })
      }
    }

    if (staleIds.length > 0) {
      await prisma.source.updateMany({
        where: { id: { in: staleIds } },
        data: { crawlErrors: { increment: 1 } },
      })
    }

    return reply.send({ alerts, checkedAt: now.toISOString() })
  })

  // ── Jobs : état ──────────────────────────────────────────────────────
  fastify.get('/admin/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
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

  // ── Stats globales ────────────────────────────────────────────────────
  fastify.get('/admin/stats', async (_request, reply) => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const currentMonth = new Date().toISOString().slice(0, 7) // "2026-06"

    const [
      totalOffers,
      pendingOffers,
      activeOffers,
      expiredOffers,
      archivedOffers,
      offersInsertedToday,
      activeUsers,
      templatesSentThisMonth,
      dailyHistory,
    ] = await Promise.all([
      prisma.jobOffer.count(),
      prisma.jobOffer.count({ where: { status: 'PENDING' } }),
      prisma.jobOffer.count({ where: { status: 'ACTIVE' } }),
      prisma.jobOffer.count({ where: { status: 'EXPIRED' } }),
      prisma.jobOffer.count({ where: { status: 'ARCHIVED' } }),
      prisma.jobOffer.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { plan: { not: 'FREEMIUM' }, status: 'ACTIVE' } }),
      prisma.templateCounter.aggregate({
        _sum: { count: true },
        where: { month: currentMonth },
      }),
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
        FROM "JobOffer"
        WHERE "createdAt" >= NOW() - INTERVAL '10 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ])

    return reply.send({
      activeUsers,
      tpqToday: 0,
      totalOffers,
      pendingOffers,
      activeOffers,
      expiredOffers,
      archivedOffers,
      offersInsertedToday,
      templatesSentThisMonth: templatesSentThisMonth._sum.count ?? 0,
      templateBudgetCap: 500,
      offersDailyHistory: dailyHistory.map((r) => ({
        date: String(r.date),
        count: Number(r.count),
      })),
    })
  })

  // ── Offres : liste ────────────────────────────────────────────────────
  fastify.get('/admin/offers', async (request, reply) => {
    const q = request.query as {
      page?: string
      source?: string
      date?: string
      status?: string
      sector?: string
      score?: string
      title?: string
    }
    const page = Math.max(1, Number(q.page ?? '1'))
    const take = 20
    const skip = (page - 1) * take

    const where: Prisma.JobOfferWhereInput = {}
    if (q.source) where.sourceId = q.source
    if (q.status) where.status = q.status as JobOfferStatus
    if (q.sector) where.sector = { contains: q.sector, mode: 'insensitive' }
    if (q.score) where.scoreConfidence = { gte: Number(q.score) / 100 }
    if (q.date) where.createdAt = { gte: new Date(q.date) }
    if (q.title) where.title = { contains: q.title, mode: 'insensitive' }

    const [total, offers] = await Promise.all([
      prisma.jobOffer.count({ where }),
      prisma.jobOffer.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          title: true,
          organization: true,
          city: true,
          sector: true,
          level: true,
          contractType: true,
          deadline: true,
          isSponsored: true,
          scoreConfidence: true,
          status: true,
          publishedAt: true,
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
      page,
      perPage: take,
      totalPages: Math.ceil(total / take),
    })
  })

  // ── Scrapers : liste ─────────────────────────────────────────────────
  fastify.get('/admin/scrapers', async (_request, reply) => {
    const sources = await prisma.source.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        lastCrawled: true,
        crawlErrors: true,
        isActive: true,
        _count: { select: { jobs: true } },
      },
    })

    return reply.send(
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        lastCrawl: s.lastCrawled?.toISOString() ?? null,
        newOffers: s._count.jobs,
        consecutiveErrors: s.crawlErrors,
        status: !s.isActive || s.crawlErrors > 5
          ? 'error'
          : s.crawlErrors > 0
            ? 'warn'
            : 'ok',
      }))
    )
  })

  // ── Offres : détail ───────────────────────────────────────────────────
  fastify.get('/admin/offers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const offer = await prisma.jobOffer.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, url: true, type: true, trustScore: true } },
        interactions: { select: { action: true } },
      },
    })
    if (!offer) return reply.status(404).send({ error: 'Not found' })

    const interactionCounts: Record<string, number> = {}
    for (const i of offer.interactions) {
      interactionCounts[i.action] = (interactionCounts[i.action] ?? 0) + 1
    }

    return reply.send({
      ...offer,
      deadline: offer.deadline?.toISOString() ?? null,
      publishedAt: offer.publishedAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
      interactions: interactionCounts,
    })
  })

  // ── Offres : créer (admin direct) ────────────────────────────────────
  fastify.post('/admin/offers', async (request, reply) => {
    const b = (request.body as Record<string, any>) ?? {}

    const title: string = b.title ?? ''
    const organization: string = b.organization ?? ''
    if (!title || !organization) {
      return reply.status(400).send({ error: 'title et organization sont requis' })
    }

    const country: string = b.country ?? 'BF'
    const city: string = b.city ?? ''
    const sector: string = b.sector ?? ''
    const level: string = b.level ?? ''
    const contractType: string = b.contractType ?? 'AUTRE'
    const description: string | undefined = b.description || undefined
    const requirements: string | undefined = b.requirements || undefined
    const contactEmail: string | undefined = b.contactEmail || undefined
    const contactPhone: string | undefined = b.contactPhone || undefined
    const contactAddress: string | undefined = b.contactAddress || undefined
    const applicationUrl: string | undefined = b.applicationUrl || undefined
    const sourceUrl: string = b.sourceUrl ?? ''
    const isSponsored: boolean = b.isSponsored ?? false
    const status: string = b.status ?? 'ACTIVE'
    const publishedAt = b.publishedAt ? new Date(b.publishedAt) : new Date()
    const deadline = b.deadline ? new Date(b.deadline) : undefined

    const hash = crypto
      .createHash('sha256')
      .update(`${title}${organization}${publishedAt.toISOString()}`)
      .digest('hex')

    const existing = await prisma.jobOffer.findUnique({ where: { hash } })
    if (existing) {
      return reply.status(409).send({ error: 'Doublon détecté', existingJobId: existing.id })
    }

    const source = await prisma.source.upsert({
      where: { url: 'internal://admin-direct' },
      create: {
        name: 'Admin Direct',
        url: 'internal://admin-direct',
        type: 'B2B_DIRECT',
        country,
        trustScore: 1.0,
      },
      update: {},
    })

    try {
      const offer = await prisma.jobOffer.create({
        data: {
          title,
          organization,
          country,
          city,
          sector,
          level,
          contractType: contractType as any,
          description,
          requirements,
          contactEmail,
          contactPhone,
          contactAddress,
          applicationUrl,
          sourceId: source.id,
          sourceUrl,
          isSponsored,
          hash,
          publishedAt,
          deadline,
          status: status as any,
          validated: true,
        },
      })
      return reply.status(201).send({ ok: true, id: offer.id })
    } catch (err) {
      fastify.log.error(err, 'Erreur création offre admin')
      return reply.status(500).send({ error: 'Erreur serveur lors de la création' })
    }
  })

  // ── Offres : modifier (champs + statut) ──────────────────────────────
  fastify.patch('/admin/offers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>

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
      fastify.log.error(err, 'Erreur mise à jour offre')
      return reply.status(500).send({ error: 'Erreur serveur lors de la mise à jour' })
    }
  })
}
