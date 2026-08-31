import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { adminAuth, requireRole } from '../../middleware/adminAuth'

const guard = [adminAuth, requireRole('SUPER_ADMIN', 'ADMIN')]

export async function fraudRoutes(fastify: FastifyInstance) {
  // GET /admin/fraud
  fastify.get('/admin/fraud', { preHandler: guard }, async (request, reply) => {
    const q = request.query as { page?: string; limit?: string }
    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))

    const suspects = await prisma.jobOffer.findMany({
      where: { isFraudSuspect: true },
      include: {
        interactions: {
          where: { reportedFraudAt: { not: null } },
          select: { userId: true, reportedFraudAt: true },
        },
        source: { select: { name: true, type: true, trustScore: true } },
      },
    })

    // Sort by report count DESC in memory, then paginate
    suspects.sort((a, b) => b.interactions.length - a.interactions.length)

    const total = suspects.length
    const data = suspects.slice((page - 1) * limit, page * limit).map(({ interactions, ...offer }) => ({
      ...offer,
      reportCount: interactions.length,
      deadline: offer.deadline?.toISOString() ?? null,
      publishedAt: offer.publishedAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    }))

    return reply.send({ data, total, page, perPage: limit })
  })

  // GET /admin/fraud/:jobId
  fastify.get('/admin/fraud/:jobId', { preHandler: guard }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const offerWithInteractions = await prisma.jobOffer.findUnique({
      where: { id: jobId },
      include: {
        interactions: {
          where: { reportedFraudAt: { not: null } },
          select: { userId: true, reportedFraudAt: true },
        },
        source: true,
      },
    })

    if (!offerWithInteractions) return reply.status(404).send({ error: 'Not found' })
    if (!offerWithInteractions.isFraudSuspect) return reply.status(404).send({ error: 'Not a fraud suspect' })

    const { interactions, ...offer } = offerWithInteractions
    return reply.send({
      ...offer,
      reportCount: interactions.length,
      deadline: offer.deadline?.toISOString() ?? null,
      publishedAt: offer.publishedAt?.toISOString() ?? null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    })
  })

  // POST /admin/fraud/:jobId/confirm
  fastify.post(
    '/admin/fraud/:jobId/confirm',
    { preHandler: guard },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }

      const offer = await prisma.jobOffer.findUnique({ where: { id: jobId } })
      if (!offer) return reply.status(404).send({ error: 'Not found' })

      await prisma.jobOffer.update({
        where: { id: jobId },
        data: {
          status: 'ARCHIVED',
          fraudConfirmedAt: new Date(),
        },
      })

      return reply.send({ message: 'Offer archived as fraudulent' })
    },
  )

  // POST /admin/fraud/:jobId/clear
  fastify.post(
    '/admin/fraud/:jobId/clear',
    { preHandler: guard },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }

      const offer = await prisma.jobOffer.findUnique({ where: { id: jobId } })
      if (!offer) return reply.status(404).send({ error: 'Not found' })

      await prisma.jobOffer.update({
        where: { id: jobId },
        data: { isFraudSuspect: false },
      })

      return reply.send({ message: 'Fraud flag cleared' })
    },
  )
}
