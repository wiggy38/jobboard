import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { verifyOfferToken } from '../services/tokenService'

export async function offerRoutes(app: FastifyInstance) {
  app.get('/api/offre/:jobId', async (req, reply) => {
    const { jobId } = req.params as { jobId: string }
    const { t: token } = req.query as { t?: string }

    let userId: string | null = null
    if (token) {
      try {
        const payload = verifyOfferToken(token)
        if (payload.offerId !== jobId) {
          return reply.status(401).send({ error: 'TOKEN_INVALID', message: 'Token invalide' })
        }
        userId = payload.userId
      } catch {
        return reply.status(401).send({ error: 'TOKEN_EXPIRED', message: 'Token invalide ou expiré' })
      }
    }

    const [offer, user] = await Promise.all([
      prisma.jobOffer.findUnique({
        where: { id: jobId },
        include: { source: true },
      }),
      userId ? prisma.user.findUnique({ where: { id: userId } }) : Promise.resolve(null),
    ])

    if (!offer || offer.status !== 'ACTIVE') {
      return reply.status(404).send({ error: 'JOB_NOT_FOUND', message: 'Offre introuvable ou expirée' })
    }

    const isUnlocked = !!user && user.plan !== 'FREEMIUM'
    const accessLevel = isUnlocked ? 'FULL' : 'PREVIEW'

    const job = {
      id: offer.id,
      title: offer.title,
      organization: offer.organization,
      city: offer.city,
      sector: offer.sector,
      contractType: offer.contractType,
      deadline: offer.deadline,
      contactEmail: isUnlocked ? offer.contactEmail : null,
      contactPhone: isUnlocked ? offer.contactPhone : null,
      contactAddress: isUnlocked ? offer.contactAddress : null,
      applicationUrl: offer.applicationUrl,
      sourceUrl: isUnlocked ? offer.source.url : null,
      sourceName: isUnlocked ? offer.source.name : null,
      status: offer.status,
    }

    if (userId) {
      await prisma.jobInteraction
        .create({ data: { userId, jobId: offer.id, action: 'SEEN' } })
        .catch(() => {})
    }

    return reply.send({ job, accessLevel })
  })

  app.get('/employer/estimate', async (req, reply) => {
    const { city, sector, level } = req.query as Record<string, string>
    const count = await prisma.profile.count({
      where: {
        cities: city ? { has: city } : undefined,
        sectors: sector ? { has: sector } : undefined,
        levels: level ? { has: level } : undefined,
        user: { status: 'ACTIVE' },
      },
    })
    return { count, estimatedProfiles: count }
  })
}
