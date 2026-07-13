import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { adminAuth } from '../../middleware/adminAuth'

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

async function getOrCreateInternalSource(type: 'SCOUT' | 'B2B_DIRECT') {
  const url = type === 'SCOUT' ? 'internal://scout-network' : 'internal://b2b-direct'
  return prisma.source.upsert({
    where: { url },
    create: {
      name: type === 'SCOUT' ? 'Scout Network' : 'B2B Direct',
      url,
      type,
      country: 'BF',
      trustScore: 0.9,
    },
    update: {},
  })
}

export async function submissionRoutes(fastify: FastifyInstance) {
  // GET /admin/submissions
  fastify.get('/admin/submissions', { preHandler: adminAuth }, async (request, reply) => {
    const q = request.query as {
      status?: string
      source?: string
      page?: string
      limit?: string
    }

    const status = q.status ?? 'pending'
    const source = q.source ?? 'all'
    const page = Math.max(1, Number(q.page ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? '20')))
    const skip = (page - 1) * limit

    const where: Record<string, any> = {}
    if (status === 'pending') where.isVerified = false
    else if (status === 'validated') where.isVerified = true

    if (source === 'SCOUT') where.scoutId = { not: null }
    else if (source === 'B2B_DIRECT') where.employerId = { not: null }

    const [data, total, pendingCount] = await Promise.all([
      prisma.jobSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          scout: { select: { name: true, phone: true, zone: true } },
          employer: { select: { name: true } },
        },
      }),
      prisma.jobSubmission.count({ where }),
      prisma.jobSubmission.count({ where: { isVerified: false } }),
    ])

    return reply.send({ data, total, pendingCount })
  })

  // GET /admin/submissions/:id
  fastify.get('/admin/submissions/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const submission = await prisma.jobSubmission.findUnique({
      where: { id },
      include: {
        scout: true,
        employer: true,
        jobOffer: true,
      },
    })
    if (!submission) return reply.status(404).send({ error: 'Not found' })

    return reply.send(submission)
  })

  // POST /admin/submissions/:id/validate
  fastify.post(
    '/admin/submissions/:id/validate',
    { preHandler: adminAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = (request.body as Record<string, any>) ?? {}

      const submission = await prisma.jobSubmission.findUnique({ where: { id } })
      if (!submission) return reply.status(404).send({ error: 'Not found' })
      if (submission.isVerified) {
        return reply.status(409).send({ error: 'Already validated', jobOfferId: submission.jobOfferId })
      }

      const raw = (submission.rawData as Record<string, any>) ?? {}

      const title: string = body.title ?? raw.title ?? ''
      const organization: string = body.organization ?? raw.organization ?? ''
      const city: string = body.city ?? raw.city ?? ''
      const sector: string = body.sector ?? raw.sector ?? ''
      const level: string = body.level ?? raw.level ?? ''
      const contractType: string = body.contractType ?? raw.contractType ?? 'AUTRE'
      const description: string | undefined = body.description ?? raw.description
      const contactEmail: string | undefined = body.contactEmail ?? raw.contactEmail
      const contactPhone: string | undefined = body.contactPhone ?? raw.contactPhone
      const contactAddress: string | undefined = body.contactAddress ?? raw.contactAddress
      const sourceUrl: string = body.sourceUrl ?? raw.sourceUrl ?? ''
      const isSponsored: boolean = body.isSponsored ?? raw.isSponsored ?? false
      const country: string = body.country ?? raw.country ?? 'BF'

      const deadline = body.deadline ?? raw.deadline
        ? new Date(body.deadline ?? raw.deadline)
        : undefined
      const publishedAt = body.publishedAt ?? raw.publishedAt
        ? new Date(body.publishedAt ?? raw.publishedAt)
        : new Date()

      const hash = sha256(`${title}${organization}${publishedAt.toISOString()}`)

      const existing = await prisma.jobOffer.findUnique({ where: { hash } })
      if (existing) {
        return reply.status(409).send({ error: 'Duplicate', existingJobId: existing.id })
      }

      const sourceType = submission.scoutId ? 'SCOUT' : 'B2B_DIRECT'
      const source = await getOrCreateInternalSource(sourceType as 'SCOUT' | 'B2B_DIRECT')

      const now = new Date()

      const [jobOffer] = await prisma.$transaction(async (tx) => {
        const offer = await tx.jobOffer.create({
          data: {
            title,
            organization,
            country,
            city,
            sector,
            level,
            contractType: contractType as any,
            description,
            contactEmail,
            contactPhone,
            contactAddress,
            sourceId: source.id,
            sourceUrl,
            isSponsored,
            hash,
            publishedAt,
            deadline,
            status: 'ACTIVE',
          },
        })

        await tx.jobSubmission.update({
          where: { id },
          data: {
            isVerified: true,
            jobOfferId: offer.id,
            validatedAt: now,
          },
        })

        if (submission.scoutId) {
          await tx.scout.update({
            where: { id: submission.scoutId },
            data: { totalCaptures: { increment: 1 } },
          })
        }

        return [offer]
      })

      return reply.send({ jobOfferId: jobOffer.id, message: 'Offer published' })
    },
  )

  // POST /admin/submissions/:id/reject
  fastify.post(
    '/admin/submissions/:id/reject',
    { preHandler: adminAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as { rejectionReason?: string }

      if (!body?.rejectionReason) {
        return reply.status(400).send({ error: 'rejectionReason is required' })
      }

      const submission = await prisma.jobSubmission.findUnique({ where: { id } })
      if (!submission) return reply.status(404).send({ error: 'Not found' })

      await prisma.jobSubmission.update({
        where: { id },
        data: {
          rejectedAt: new Date(),
          rejectionReason: body.rejectionReason,
        },
      })

      return reply.send({ message: 'Submission rejected' })
    },
  )

  // PATCH /admin/submissions/:id
  fastify.patch('/admin/submissions/:id', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body as Record<string, any>) ?? {}

    const submission = await prisma.jobSubmission.findUnique({ where: { id } })
    if (!submission) return reply.status(404).send({ error: 'Not found' })

    const currentRaw = (submission.rawData as Record<string, any>) ?? {}
    const mergedRaw = { ...currentRaw, ...body }

    const updated = await prisma.jobSubmission.update({
      where: { id },
      data: { rawData: mergedRaw },
    })

    return reply.send(updated)
  })
}
