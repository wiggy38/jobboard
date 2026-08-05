import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'

export async function offerRoutes(app: FastifyInstance) {
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
