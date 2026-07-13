import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { adminAuth } from '../../middleware/adminAuth'

function getMonthBounds(yyyyMm: string): { start: Date; end: Date } {
  const [y, m] = yyyyMm.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1)
  return { start, end }
}

export async function scoutRoutes(fastify: FastifyInstance) {
  // GET /admin/scouts
  fastify.get('/admin/scouts', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      isActive?: string
      zone?: string
      page?: string
      limit?: string
    }

    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit
    const CAPTURE_RATE = Number(process.env.SCOUT_CAPTURE_RATE ?? 200)

    const where: Record<string, any> = {}
    if (q.isActive !== undefined) where.isActive = q.isActive === 'true'
    if (q.zone) where.zone = { contains: q.zone, mode: 'insensitive' }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [scouts, total] = await Promise.all([
      prisma.scout.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.scout.count({ where }),
    ])

    if (scouts.length === 0) {
      return reply.send({ data: [], total })
    }

    const scoutIds = scouts.map((s) => s.id)

    const [submittedGroups, validatedGroups, pendingGroups] = await Promise.all([
      prisma.jobSubmission.groupBy({
        by: ['scoutId'],
        where: {
          scoutId: { in: scoutIds },
          submittedAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _count: { id: true },
      }),
      prisma.jobSubmission.groupBy({
        by: ['scoutId'],
        where: {
          scoutId: { in: scoutIds },
          isVerified: true,
          validatedAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _count: { id: true },
      }),
      prisma.jobSubmission.groupBy({
        by: ['scoutId'],
        where: {
          scoutId: { in: scoutIds },
          isVerified: false,
          rejectedAt: null,
        },
        _count: { id: true },
      }),
    ])

    const submittedMap = Object.fromEntries(
      submittedGroups.map((g) => [g.scoutId as string, g._count.id]),
    )
    const validatedMap = Object.fromEntries(
      validatedGroups.map((g) => [g.scoutId as string, g._count.id]),
    )
    const pendingMap = Object.fromEntries(
      pendingGroups.map((g) => [g.scoutId as string, g._count.id]),
    )

    const data = scouts.map((scout) => {
      const validatedThisMonth = validatedMap[scout.id] ?? 0
      return {
        ...scout,
        submissionsThisMonth: submittedMap[scout.id] ?? 0,
        validatedThisMonth,
        pendingCount: pendingMap[scout.id] ?? 0,
        earnings: {
          thisMonth: validatedThisMonth * CAPTURE_RATE,
          total: scout.totalEarned,
        },
      }
    })

    return reply.send({ data, total })
  })

  // GET /admin/scouts/payments — must be before /:id
  fastify.get('/admin/scouts/payments', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as { scoutId?: string; month?: string }

    const where: Record<string, any> = {}
    if (q.scoutId) where.scoutId = q.scoutId
    if (q.month) where.month = q.month

    const payments = await prisma.scoutPayment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      include: { scout: { select: { name: true, phone: true, zone: true } } },
    })

    return reply.send(payments)
  })

  // GET /admin/scouts/:id
  fastify.get('/admin/scouts/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const CAPTURE_RATE = Number(process.env.SCOUT_CAPTURE_RATE ?? 200)

    const scout = await prisma.scout.findUnique({
      where: { id },
      include: {
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
      },
    })
    if (!scout) return reply.status(404).send({ error: 'Not found' })

    // Monthly stats for last 6 months
    const monthlyStats: { month: string; submitted: number; validated: number; earnings: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const { start, end } = getMonthBounds(yyyyMm)

      const [submitted, validated] = await Promise.all([
        prisma.jobSubmission.count({ where: { scoutId: id, submittedAt: { gte: start, lt: end } } }),
        prisma.jobSubmission.count({
          where: { scoutId: id, isVerified: true, validatedAt: { gte: start, lt: end } },
        }),
      ])

      monthlyStats.push({ month: yyyyMm, submitted, validated, earnings: validated * CAPTURE_RATE })
    }

    return reply.send({ ...scout, monthlyStats })
  })

  // POST /admin/scouts
  fastify.post('/admin/scouts', { preHandler: adminAuth }, async (request, reply) => {
    const body = request.body as { name?: string; phone?: string; zone?: string }

    if (!body.name || !body.phone || !body.zone) {
      return reply.status(400).send({ error: 'name, phone and zone are required' })
    }

    const e164 = /^\+[1-9]\d{7,14}$/
    if (!e164.test(body.phone)) {
      return reply.status(400).send({ error: 'phone must be in E.164 format (e.g. +22670000000)' })
    }

    try {
      const scout = await prisma.scout.create({
        data: {
          name: body.name,
          phone: body.phone,
          zone: body.zone,
          isActive: true,
          totalCaptures: 0,
          totalEarned: 0,
        },
      })
      return reply.status(201).send(scout)
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Phone already registered' })
      }
      throw err
    }
  })

  // PATCH /admin/scouts/:id
  fastify.patch('/admin/scouts/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string
      phone?: string
      zone?: string
      isActive?: boolean
    }

    if (body.phone) {
      const e164 = /^\+[1-9]\d{7,14}$/
      if (!e164.test(body.phone)) {
        return reply.status(400).send({ error: 'phone must be in E.164 format' })
      }
    }

    const data: Record<string, any> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.phone !== undefined) data.phone = body.phone
    if (body.zone !== undefined) data.zone = body.zone
    if (body.isActive !== undefined) data.isActive = body.isActive

    try {
      const scout = await prisma.scout.update({ where: { id }, data })
      return reply.send(scout)
    } catch (err: any) {
      if (err.code === 'P2025') return reply.status(404).send({ error: 'Not found' })
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Phone already registered' })
      throw err
    }
  })

  // POST /admin/scouts/:id/pay
  fastify.post('/admin/scouts/:id/pay', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { month?: string; amount?: number }

    if (!body.month || !body.amount) {
      return reply.status(400).send({ error: 'month (YYYY-MM) and amount are required' })
    }
    if (!/^\d{4}-\d{2}$/.test(body.month)) {
      return reply.status(400).send({ error: 'month must be in YYYY-MM format' })
    }

    const scout = await prisma.scout.findUnique({ where: { id } })
    if (!scout) return reply.status(404).send({ error: 'Not found' })

    const [, updatedScout] = await prisma.$transaction([
      prisma.scoutPayment.create({
        data: { scoutId: id, month: body.month, amount: body.amount },
      }),
      prisma.scout.update({
        where: { id },
        data: { totalEarned: { increment: body.amount } },
      }),
    ])

    return reply.send({ message: 'Payment recorded', totalEarned: updatedScout.totalEarned })
  })
}
