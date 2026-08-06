import type { FastifyInstance } from 'fastify'
import { prisma } from './lib/prisma'

type TokenVerifyResult =
  | { ok: true; userId: string | null }
  | { ok: false; error: string; message: string }

function verifyOfferToken(fastify: FastifyInstance, jobId: string, token: string | null): TokenVerifyResult {
  if (!token) return { ok: true, userId: null }
  try {
    const payload = fastify.jwt.verify<{ userId: string; offerId: string }>(token)
    if (payload.offerId !== jobId) {
      return { ok: false, error: 'TOKEN_INVALID', message: 'Token invalide' }
    }
    return { ok: true, userId: payload.userId }
  } catch {
    return { ok: false, error: 'TOKEN_EXPIRED', message: 'Lien expiré ou invalide' }
  }
}

export async function offreRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    // ÉTAPE 2 — Vérifier le token JWT si présent (intégrité du lien + identifie
    // l'utilisateur pour le tracking JobInteraction ; le contenu de la réponse
    // ne dépend plus du plan de l'utilisateur)
    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }
    const userId = verified.userId

    // ÉTAPE 3 — Récupérer l'offre en DB
    const job = await prisma.jobOffer.findUnique({
      where: { id: jobId },
      include: { source: { select: { name: true, url: true, trustScore: true } } },
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

    // ÉTAPE 4 — Contacts et source visibles pour tous les plans (y compris
    // FREEMIUM) : le contenu affiché est une ébauche, la source sert de
    // redirection vers l'annonce complète — plus un levier de conversion.
    if (userId) {
      await prisma.jobInteraction
        .create({ data: { userId, jobId: job.id, action: 'SEEN' } })
        .catch(() => {})
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
        sourceUrl: job.sourceUrl,
        sourceName: job.source.name,
        sourceTrustScore: job.source.trustScore,
      },
      accessLevel: 'FULL',
    })
  })

  // Tracking du clic sortant vers la source (bouton "Voir l'offre complète
  // sur le site source" côté page offre tokenisée) — appelé en fire-and-forget
  // (keepalive) par le frontend au moment du clic, en parallèle de la
  // navigation vers sourceUrl.
  fastify.post<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId/click', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }

    if (verified.userId) {
      await prisma.jobInteraction
        .create({ data: { userId: verified.userId, jobId, action: 'CLICKED_SOURCE' } })
        .catch(() => {})
    }

    return reply.status(204).send()
  })

  // Tracking du partage (bouton "Partager avec un ami" / partage WhatsApp
  // côté page offre tokenisée) — appelé en fire-and-forget (keepalive) par le
  // frontend au moment du partage.
  fastify.post<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId/share', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }

    if (verified.userId) {
      await prisma.jobInteraction
        .create({ data: { userId: verified.userId, jobId, action: 'SHARED' } })
        .catch(() => {})
    }

    return reply.status(204).send()
  })
}
