import { PrismaClient, JobOfferStatus } from '@prisma/client'

// Expire les offres ACTIVE périmées : par deadline dépassée, ou par ttlDays
// (createdAt + ttlDays) pour les offres sans deadline. Appelé en fin de
// pipeline (effet de bord d'un run de scraper) et par le job cron standalone
// `expire-offers` (apps/scraper/src/scheduler.ts), qui garantit l'expiration
// même sans aucun scraper actif.
export async function expireStaleOffers(prisma: PrismaClient): Promise<{ byDeadline: number; byTtl: number }> {
  const now = new Date()

  const byDeadline = await prisma.jobOffer.updateMany({
    where: { status: JobOfferStatus.ACTIVE, deadline: { lt: now } },
    data: { status: JobOfferStatus.EXPIRED },
  })

  // Offres sans deadline : on respecte le ttlDays par offre
  const noDeadlineCandidates = await prisma.jobOffer.findMany({
    where: { status: JobOfferStatus.ACTIVE, deadline: null },
    select: { id: true, createdAt: true, ttlDays: true },
  })
  const staleIds = noDeadlineCandidates
    .filter(j => {
      const expiry = new Date(j.createdAt)
      expiry.setDate(expiry.getDate() + j.ttlDays)
      return expiry < now
    })
    .map(j => j.id)

  if (staleIds.length > 0) {
    await prisma.jobOffer.updateMany({
      where: { id: { in: staleIds } },
      data: { status: JobOfferStatus.EXPIRED },
    })
  }

  return { byDeadline: byDeadline.count, byTtl: staleIds.length }
}
