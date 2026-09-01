import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { adminAuth, requireRole } from '../../middleware/adminAuth'

const guard = [adminAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

// Bornes lundi 00:00:00 → dimanche 23:59:59.999 pour une semaine ISO
// "YYYY-Www" (ex: "2026-W36"). Lève une erreur si le format est invalide.
function isoWeekRange(weekParam: string): { start: Date; end: Date } {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekParam)
  if (!match) throw new Error('INVALID_WEEK_FORMAT')

  const year = Number(match[1])
  const week = Number(match[2])
  if (week < 1 || week > 53) throw new Error('INVALID_WEEK_FORMAT')

  // 4 janvier est toujours dans la semaine ISO 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // dimanche = 7 plutôt que 0
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)

  const start = new Date(week1Monday)
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)

  return { start, end }
}

export async function unknownCommandRoutes(fastify: FastifyInstance) {
  // GET /admin/unknown-commands
  fastify.get('/admin/unknown-commands', { preHandler: guard }, async (request, reply) => {
    const q = request.query as {
      phoneNumber?: string
      from?: string
      to?: string
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

    const where: Record<string, any> = { createdAt: { gte: fromDate, lte: toDate } }
    if (q.phoneNumber) where.phoneNumber = { contains: q.phoneNumber, mode: 'insensitive' }

    const [data, total] = await Promise.all([
      prisma.unknownCommandLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.unknownCommandLog.count({ where }),
    ])

    return reply.send({
      data,
      total,
      page,
      perPage: limit,
      totalPages: Math.ceil(total / limit),
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    })
  })

  // GET /admin/unknown-commands/export?week=2026-W36
  fastify.get('/admin/unknown-commands/export', { preHandler: guard }, async (request, reply) => {
    const q = request.query as { week?: string }
    if (!q.week) return reply.status(400).send({ error: 'week is required (format YYYY-Www)' })

    let range: { start: Date; end: Date }
    try {
      range = isoWeekRange(q.week)
    } catch {
      return reply.status(400).send({ error: 'INVALID_WEEK_FORMAT', message: 'Format attendu : YYYY-Www (ex: 2026-W36)' })
    }

    const rows = await prisma.unknownCommandLog.findMany({
      where: { createdAt: { gte: range.start, lte: range.end } },
      orderBy: { createdAt: 'asc' },
    })

    const jsonl = rows
      .map((r) =>
        JSON.stringify({
          timestamp: r.createdAt.toISOString(),
          phoneNumber: r.phoneNumber,
          raw: r.raw,
          command: r.command,
          country: r.country,
        }),
      )
      .join('\n')

    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="unknown-commands-${q.week}.jsonl"`)
    return reply.send(jsonl)
  })
}
