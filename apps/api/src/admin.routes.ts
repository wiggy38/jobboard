import type { FastifyInstance } from 'fastify'
import { Prisma, JobOfferStatus, TemplateType } from '@prisma/client'
import { Queue } from 'bullmq'
import crypto from 'crypto'
import { parseDeadlineInput } from '@tumaa/shared'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'
import { adminAuth, requireRole } from './middleware/adminAuth'
import {
  buildInteractionCountsSelect,
  buildInteractionEventsUnion,
  INTERACTION_ACTIONS,
  type InteractionAction,
} from './lib/jobInteractionEvents'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const scraperGuard = [adminAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

// Pays couverts par les canaux WhatsApp — 1 canal par pays (voir CLAUDE.md)
const SUPPORTED_COUNTRIES = ['BF', 'BJ', 'TG', 'CI']

function parseCountry(query: unknown): string | undefined {
  const c = (query as { country?: string } | undefined)?.country
  return c && SUPPORTED_COUNTRIES.includes(c) ? c : undefined
}

export async function adminRoutes(fastify: FastifyInstance) {
  // ── Scrapers : relancer ──────────────────────────────────────────────
  fastify.post('/admin/scrapers/:id/run', { preHandler: scraperGuard }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Source introuvable' })
    const source = await prisma.source.findUnique({ where: { id }, select: { name: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })

    const jobId = `manual-${source.name}-${Date.now()}`
    const queue = new Queue('scraper', { connection: redis })
    await queue.add('manual-run', { scraperKey: source.name }, { jobId })
    await queue.close()

    return reply.send({ jobId })
  })

  // ── Scrapers : désactiver/réactiver ──────────────────────────────────
  fastify.post('/admin/scrapers/:id/disable', { preHandler: scraperGuard }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Source introuvable' })
    const source = await prisma.source.findUnique({ where: { id }, select: { isActive: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })
    await prisma.source.update({ where: { id }, data: { isActive: !source.isActive } })
    return reply.send({ ok: true, isActive: !source.isActive })
  })

  // ── Scrapers : sync tous ─────────────────────────────────────────────
  fastify.post('/admin/scrapers/sync', { preHandler: scraperGuard }, async (_request, reply) => {
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
  fastify.post('/admin/scrapers/health', { preHandler: scraperGuard }, async (_request, reply) => {
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
  fastify.get('/admin/jobs/:jobId', { preHandler: scraperGuard }, async (request, reply) => {
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
  fastify.get('/admin/stats', { preHandler: adminAuth }, async (request, reply) => {
    const country = parseCountry(request.query)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const currentMonth = new Date().toISOString().slice(0, 7) // "2026-06"

    const offerCountryWhere = country ? { country } : {}
    const userCountryWhere = country ? { countries: { has: country } } : {}

    const [
      totalOffers,
      pendingOffers,
      activeOffers,
      expiredOffers,
      archivedOffers,
      offersInsertedToday,
      activeUsers,
      totalActiveUsers,
      templatesSentThisMonth,
      dailyHistory,
      pullHistory,
    ] = await Promise.all([
      prisma.jobOffer.count({ where: offerCountryWhere }),
      prisma.jobOffer.count({ where: { status: 'PENDING', ...offerCountryWhere } }),
      prisma.jobOffer.count({ where: { status: 'ACTIVE', ...offerCountryWhere } }),
      prisma.jobOffer.count({ where: { status: 'EXPIRED', ...offerCountryWhere } }),
      prisma.jobOffer.count({ where: { status: 'ARCHIVED', ...offerCountryWhere } }),
      prisma.jobOffer.count({ where: { createdAt: { gte: todayStart }, ...offerCountryWhere } }),
      prisma.user.count({ where: { plan: { not: 'FREEMIUM' }, status: 'ACTIVE', ...userCountryWhere } }),
      prisma.user.count({ where: { status: 'ACTIVE', ...userCountryWhere } }),
      prisma.templateCounter.aggregate({
        _sum: { count: true },
        where: { month: currentMonth, ...(country ? { user: { countries: { has: country } } } : {}) },
      }),
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
        FROM "JobOffer"
        WHERE "createdAt" >= NOW() - INTERVAL '10 days'
        ${country ? Prisma.sql`AND country = ${country}` : Prisma.empty}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT TO_CHAR(pe."date", 'YYYY-MM-DD') AS date, COUNT(DISTINCT pe."userId") AS count
        FROM "PullEvent" pe
        JOIN "User" u ON u.id = pe."userId"
        WHERE pe."date" >= NOW() - INTERVAL '7 days'
        ${country ? Prisma.sql`AND ${country} = ANY(u."countries")` : Prisma.empty}
        GROUP BY pe."date"
        ORDER BY date ASC
      `,
    ])

    const pullsByDate = new Map(pullHistory.map((r) => [String(r.date), Number(r.count)]))
    const todayIso = todayStart.toISOString().slice(0, 10)
    const tpqPct = (pulls: number) =>
      totalActiveUsers === 0 ? 0 : Math.round((pulls / totalActiveUsers) * 100)

    const tpqHistory = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - (6 - i))
      const iso = d.toISOString().slice(0, 10)
      return { date: iso, count: tpqPct(pullsByDate.get(iso) ?? 0) }
    })

    return reply.send({
      activeUsers,
      tpqToday: tpqPct(pullsByDate.get(todayIso) ?? 0),
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
      tpqHistory,
    })
  })

  // ── KPI journaliers : inscription, profil complété, offres consultées,
  // clic offre verrouillée, conversion Premium, partage ──────────────────
  fastify.get('/admin/kpis', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as { from?: string; to?: string }
    const country = parseCountry(request.query)

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const fromDate = new Date((q.from ?? defaultFrom.toISOString().slice(0, 10)) + 'T00:00:00.000Z')
    const toDate = new Date((q.to ?? now.toISOString().slice(0, 10)) + 'T23:59:59.999Z')

    const countryFilter = country ? Prisma.sql`AND ${country} = ANY(u."countries")` : Prisma.empty

    const [
      signups,
      profileCompleted,
      offersViewed,
      lockedClicks,
      premiumConversions,
      shares,
      referralSignups,
      referralClicks,
      existingUsersAtPeriodStart,
    ] =
      await Promise.all([
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(u."createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "User" u
          WHERE u."createdAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(u."createdAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(p."createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "Profile" p
          JOIN "User" u ON u.id = p."userId"
          WHERE p."createdAt" BETWEEN ${fromDate} AND ${toDate}
            AND cardinality(p.cities) > 0 AND cardinality(p.sectors) > 0
          ${countryFilter}
          GROUP BY DATE(p."createdAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(ji."seenAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "JobInteraction" ji
          JOIN "User" u ON u.id = ji."userId"
          WHERE ji."seenAt" IS NOT NULL AND ji."seenAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(ji."seenAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(ji."clickedLockedAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "JobInteraction" ji
          JOIN "User" u ON u.id = ji."userId"
          WHERE ji."clickedLockedAt" IS NOT NULL AND ji."clickedLockedAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(ji."clickedLockedAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(pay."createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "Payment" pay
          JOIN "User" u ON u.id = pay."userId"
          WHERE pay.status = 'SUCCESS' AND pay."createdAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(pay."createdAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(ji."sharedAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "JobInteraction" ji
          JOIN "User" u ON u.id = ji."userId"
          WHERE ji."sharedAt" IS NOT NULL AND ji."sharedAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(ji."sharedAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(u."createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "User" u
          WHERE u."referredById" IS NOT NULL AND u."createdAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(u."createdAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT TO_CHAR(DATE(slc."createdAt"), 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM "ShortLinkClick" slc
          JOIN "ShortLink" sl ON sl.code = slc."shortLinkId"
          JOIN "User" u ON u.id = sl."referrerId"
          WHERE slc."createdAt" BETWEEN ${fromDate} AND ${toDate}
          ${countryFilter}
          GROUP BY DATE(slc."createdAt")
          ORDER BY date ASC
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS count
          FROM "User" u
          WHERE u."createdAt" < ${fromDate}
          ${countryFilter}
        `,
      ])

    const toSeries = (rows: { date: string; count: bigint }[]) =>
      rows.map((r) => ({ date: String(r.date), count: Number(r.count) }))
    const sumSeries = (rows: { date: string; count: bigint }[]) =>
      rows.reduce((acc, r) => acc + Number(r.count), 0)

    const series = {
      signups: toSeries(signups),
      profileCompleted: toSeries(profileCompleted),
      offersViewed: toSeries(offersViewed),
      lockedClicks: toSeries(lockedClicks),
      premiumConversions: toSeries(premiumConversions),
      shares: toSeries(shares),
      referralSignups: toSeries(referralSignups),
      referralClicks: toSeries(referralClicks),
    }

    const totals = {
      signups: sumSeries(signups),
      profileCompleted: sumSeries(profileCompleted),
      offersViewed: sumSeries(offersViewed),
      lockedClicks: sumSeries(lockedClicks),
      premiumConversions: sumSeries(premiumConversions),
      shares: sumSeries(shares),
      referralSignups: sumSeries(referralSignups),
      referralClicks: sumSeries(referralClicks),
    }

    // K-factor simplifié : inscriptions via parrainage sur la période / base
    // d'utilisateurs existants en début de période (proxy standard, faute
    // d'un meilleur dénominateur "invitations envoyées"). clickToSignupRate
    // ci-dessous complète ce proxy avec un vrai taux de conversion basé sur
    // les clics effectifs des ShortLink (voir ShortLinkClick).
    const existingUsersCount = Number(existingUsersAtPeriodStart[0]?.count ?? 0)

    return reply.send({
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      series,
      totals,
      kFactor: {
        value: existingUsersCount > 0 ? totals.referralSignups / existingUsersCount : null,
        referralSignups: totals.referralSignups,
        existingUsersAtPeriodStart: existingUsersCount,
        referralClicks: totals.referralClicks,
        clickToSignupRate: totals.referralClicks > 0 ? totals.referralSignups / totals.referralClicks : null,
      },
    })
  })

  // ── Templates : usage du mois par type ─────────────────────────────────
  fastify.get('/admin/templates/usage', { preHandler: adminAuth }, async (request, reply) => {
    const country = parseCountry(request.query)
    const currentMonth = new Date().toISOString().slice(0, 7)

    // Plafonds par utilisateur/mois (voir schema.prisma — enum TemplateType)
    const PER_USER_CAP: Record<string, number> = {
      RELANCE: 2,
      MATCH_PARFAIT: 1,
      NUDGE_PREMIUM: 1,
      // Catégorie Meta UTILITY (sélection quotidienne PREMIUM/ELITE) — plafond
      // indépendant du GLOBAL_CAP marketing partagé par les 3 types ci-dessus,
      // voir apps/bot/src/counters/templateCounter.ts.
      DAILY_DIGEST: 31,
    }

    const [usage, activeUsers] = await Promise.all([
      prisma.templateCounter.groupBy({
        by: ['type'],
        where: { month: currentMonth, ...(country ? { user: { countries: { has: country } } } : {}) },
        _sum: { count: true },
      }),
      prisma.user.count({ where: { status: 'ACTIVE', ...(country ? { countries: { has: country } } : {}) } }),
    ])

    const usedByType = new Map(usage.map((u) => [u.type, u._sum.count ?? 0]))

    return reply.send(
      Object.keys(PER_USER_CAP).map((type) => ({
        type,
        used: usedByType.get(type as TemplateType) ?? 0,
        cap: activeUsers * PER_USER_CAP[type],
      }))
    )
  })

  // ── Templates : historique des envois ──────────────────────────────────
  fastify.get('/admin/templates/logs', { preHandler: adminAuth }, async (request, reply) => {
    const country = parseCountry(request.query)

    const notifications = await prisma.notification.findMany({
      where: {
        isPaid: true,
        templateType: { not: null },
        ...(country ? { user: { countries: { has: country } } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
      include: { user: { select: { phone: true } } },
    })

    return reply.send(
      notifications.map((n) => ({
        id: n.id,
        phoneNumber: n.user.phone,
        type: n.templateType,
        sentAt: n.sentAt.toISOString(),
        status: n.status,
      }))
    )
  })

  // ── Offres : liste ────────────────────────────────────────────────────
  fastify.get('/admin/offers', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      page?: string
      source?: string
      date?: string
      status?: string
      sector?: string
      score?: string
      title?: string
      country?: string
      city?: string
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
    if (q.city) where.city = { contains: q.city, mode: 'insensitive' }
    const country = parseCountry(q)
    if (country) where.country = country

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
          country: true,
          sector: true,
          level: true,
          contractType: true,
          deadline: true,
          isSponsored: true,
          isFeatured: true,
          scoreConfidence: true,
          status: true,
          publishedAt: true,
        },
      }),
    ])

    const offerIds = offers.map((o) => o.id)
    const interactionStats = offerIds.length
      ? await prisma.$queryRaw<{ jobId: string; views: bigint; clicks: bigint }[]>`
          SELECT "jobId", COUNT("seenAt") AS views, COUNT("clickedSourceAt") AS clicks
          FROM "JobInteraction"
          WHERE "jobId" IN (${Prisma.join(offerIds)})
          GROUP BY "jobId"
        `
      : []
    const statsByOffer = new Map<string, { views: number; clicks: number }>()
    for (const s of interactionStats) {
      statsByOffer.set(s.jobId, { views: Number(s.views), clicks: Number(s.clicks) })
    }

    return reply.send({
      offers: offers.map((o) => ({
        ...o,
        deadline: o.deadline?.toISOString() ?? null,
        publishedAt: o.publishedAt?.toISOString() ?? null,
        views: statsByOffer.get(o.id)?.views ?? 0,
        clicks: statsByOffer.get(o.id)?.clicks ?? 0,
      })),
      total,
      page,
      perPage: take,
      totalPages: Math.ceil(total / take),
    })
  })

  // ── Scrapers : liste ─────────────────────────────────────────────────
  fastify.get('/admin/scrapers', { preHandler: scraperGuard }, async (request, reply) => {
    const country = parseCountry(request.query)
    const sources = await prisma.source.findMany({
      where: country ? { country } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        country: true,
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
        country: s.country,
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

  // ── Scrapers : historique des pulls ───────────────────────────────────
  fastify.get('/admin/scrapers/:id/runs', { preHandler: scraperGuard }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as { limit?: string }
    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200)
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Source introuvable' })

    const source = await prisma.source.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!source) return reply.status(404).send({ error: 'Source introuvable' })

    const runs = await prisma.scraperRun.findMany({
      where: { sourceId: id },
      orderBy: { startedAt: 'desc' },
      take: limit,
    })

    return reply.send({
      source: { id: source.id, name: source.name },
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        totalScraped: r.totalScraped,
        totalInserted: r.totalInserted,
        totalDuplicates: r.totalDuplicates,
        totalExpired: r.totalExpired,
        totalErrors: r.totalErrors,
        duration: r.duration,
        errorMessage: r.errorMessage,
        startedAt: r.startedAt.toISOString(),
      })),
    })
  })

  // ── Offres : détail ───────────────────────────────────────────────────
  fastify.get('/admin/offers/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const offer = await prisma.jobOffer.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, url: true, type: true, trustScore: true } },
      },
    })
    if (!offer) return reply.status(404).send({ error: 'Not found' })

    const [countsRow] = await prisma.$queryRawUnsafe<Record<InteractionAction, bigint>[]>(
      `SELECT ${buildInteractionCountsSelect()} FROM "JobInteraction" WHERE "jobId" = $1`,
      id,
    )
    const interactionCounts: Record<string, number> = {}
    for (const action of INTERACTION_ACTIONS) {
      interactionCounts[action] = Number(countsRow[action])
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

  // ── Offres : interactions abonnés (paginé) ──────────────────────────────
  fastify.get('/admin/offers/:id/interactions', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = request.query as { page?: string; perPage?: string }
    const page = Math.max(1, Number(q.page) || 1)
    const perPage = Math.min(100, Math.max(1, Number(q.perPage) || 20))

    const eventsUnion = buildInteractionEventsUnion()
    const [data, totalRows] = await Promise.all([
      prisma.$queryRawUnsafe<
        { action: InteractionAction; event_at: Date; user_id: string; user_phone: string; user_displayName: string | null }[]
      >(
        `SELECT events.action, events.event_at,
                u.id AS user_id, u.phone AS user_phone, u."displayName" AS "user_displayName"
         FROM (${eventsUnion}) events
         JOIN "User" u ON u.id = events."userId"
         WHERE events."jobId" = $1
         ORDER BY events.event_at DESC
         LIMIT $2 OFFSET $3`,
        id,
        perPage,
        (page - 1) * perPage,
      ),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM (${eventsUnion}) events WHERE events."jobId" = $1`,
        id,
      ),
    ])
    const total = Number(totalRows[0].count)

    return reply.send({
      data: data.map((i) => ({
        action: i.action,
        createdAt: i.event_at.toISOString(),
        user: { id: i.user_id, phone: i.user_phone, displayName: i.user_displayName },
      })),
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    })
  })

  // ── Offres : créer (admin direct) ────────────────────────────────────
  fastify.post('/admin/offers', { preHandler: adminAuth }, async (request, reply) => {
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
    const isFeatured: boolean = b.isFeatured ?? false
    const status: string = b.status ?? 'ACTIVE'
    const publishedAt = b.publishedAt ? new Date(b.publishedAt) : new Date()
    const deadline = parseDeadlineInput(b.deadline) ?? undefined

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
          isFeatured,
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
  fastify.patch('/admin/offers/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = request.body as Record<string, any>

    const editableFields = [
      'title', 'organization', 'city', 'sector', 'level', 'contractType',
      'description', 'requirements', 'contactEmail', 'contactPhone',
      'contactAddress', 'applicationUrl', 'isSponsored', 'isFeatured', 'isFraudSuspect',
      'validated', 'ttlDays',
    ]

    const data: Record<string, any> = {}
    for (const key of editableFields) {
      if (key in b) data[key] = b[key]
    }

    if ('deadline' in b) {
      data.deadline = parseDeadlineInput(b.deadline as string | undefined)
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
