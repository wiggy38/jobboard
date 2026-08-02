import type { FastifyInstance } from 'fastify'
import { prisma } from './lib/prisma'

export async function offreRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    // ÉTAPE 2 — Vérifier le token JWT si présent
    let userId: string | null = null
    if (token) {
      try {
        const payload = fastify.jwt.verify<{ userId: string; offerId: string }>(token)
        if (payload.offerId !== jobId) {
          return reply.status(401).send({
            error: 'TOKEN_INVALID',
            message: 'Token invalide',
          })
        }
        userId = payload.userId
      } catch {
        return reply.status(401).send({
          error: 'TOKEN_EXPIRED',
          message: 'Lien expiré ou invalide',
        })
      }
    }

    // ÉTAPE 3 — Récupérer l'offre en DB
    const job = await prisma.jobOffer.findUnique({
      where: { id: jobId },
      include: { source: { select: { name: true, url: true } } },
    })

    if (!job) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: 'Offre introuvable',
      })
    }

    if (job.status !== 'ACTIVE') {
      return reply.status(404).send({
        error: 'JOB_INACTIVE',
        message: "Cette offre n'est plus active",
      })
    }

    // ÉTAPE 4 — Les contacts sont visibles pour tous les plans (y compris
    // FREEMIUM). La source scrappée (sourceUrl/sourceName) reste réservée aux
    // plans payants — cf. .claude/CLAUDE.md, règle indépendante de la grille
    // tarifaire (protection de l'attribution de la source, pas un levier de
    // conversion).
    let showSource = false

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, status: true, planEndAt: true },
      })

      showSource = !!(
        user &&
        user.status === 'ACTIVE' &&
        user.plan !== 'FREEMIUM' &&
        !(user.planEndAt && user.planEndAt < new Date())
      )
    }

    // ÉTAPE 5 — Construire la réponse
    return reply.send({
      job: {
        id: job.id,
        title: job.title,
        city: job.city,
        sector: job.sector,
        contractType: job.contractType,
        deadline: job.deadline?.toISOString() ?? null,
        status: job.status,
        organization: job.organization,
        level: job.level,
        description: job.description,
        requirements: job.requirements,
        contactEmail: job.contactEmail,
        contactPhone: job.contactPhone,
        contactAddress: job.contactAddress,
        applicationUrl: job.applicationUrl,
        sourceUrl: showSource ? job.sourceUrl : null,
        sourceName: showSource ? job.source.name : null,
      },
      accessLevel: 'FULL',
    })
  })
}
