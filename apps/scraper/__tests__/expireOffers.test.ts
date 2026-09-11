import { expireStaleOffers } from '../src/lib/expireOffers'

jest.mock('@prisma/client', () => ({
  JobOfferStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', ARCHIVED: 'ARCHIVED' },
}))

describe('expireStaleOffers', () => {
  const mockPrisma = {
    jobOffer: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('expire les offres ACTIVE dont la deadline est dépassée', async () => {
    mockPrisma.jobOffer.updateMany.mockResolvedValueOnce({ count: 3 })
    mockPrisma.jobOffer.findMany.mockResolvedValueOnce([])

    const result = await expireStaleOffers(mockPrisma)

    expect(mockPrisma.jobOffer.updateMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'ACTIVE', deadline: { lt: expect.any(Date) } },
      data: { status: 'EXPIRED' },
    })
    expect(result.byDeadline).toBe(3)
  })

  it('expire les offres sans deadline dont createdAt + ttlDays est dépassé', async () => {
    const now = new Date()
    const oldCreatedAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) // 40 jours
    const recentCreatedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 jours

    mockPrisma.jobOffer.updateMany.mockResolvedValueOnce({ count: 0 })
    mockPrisma.jobOffer.findMany.mockResolvedValueOnce([
      { id: 'stale-1', createdAt: oldCreatedAt, ttlDays: 30 },
      { id: 'fresh-1', createdAt: recentCreatedAt, ttlDays: 30 },
    ])
    mockPrisma.jobOffer.updateMany.mockResolvedValueOnce({ count: 1 })

    const result = await expireStaleOffers(mockPrisma)

    expect(mockPrisma.jobOffer.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['stale-1'] } },
      data: { status: 'EXPIRED' },
    })
    expect(result.byTtl).toBe(1)
  })

  it("n'effectue pas de second updateMany si aucune offre sans deadline n'est périmée", async () => {
    mockPrisma.jobOffer.updateMany.mockResolvedValueOnce({ count: 0 })
    mockPrisma.jobOffer.findMany.mockResolvedValueOnce([
      { id: 'fresh-1', createdAt: new Date(), ttlDays: 30 },
    ])

    const result = await expireStaleOffers(mockPrisma)

    expect(mockPrisma.jobOffer.updateMany).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ byDeadline: 0, byTtl: 0 })
  })
})
