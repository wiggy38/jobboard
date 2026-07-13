import { PrismaClient } from '@prisma/client'
import { runPipeline } from '../src/pipeline'
import sources from '../src/sources'

// Mock @prisma/client — factory runs before imports due to hoisting
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  JobOfferStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', ARCHIVED: 'ARCHIVED' },
  ContractType: {
    CDI: 'CDI', CDD: 'CDD', STAGE: 'STAGE',
    ALTERNANCE: 'ALTERNANCE', FREELANCE: 'FREELANCE',
    BENEVOLE: 'BENEVOLE', AUTRE: 'AUTRE',
  },
}))

// Mock sources module — __esModule:true required for default export interop with ts-jest
jest.mock('../src/sources', () => {
  const mockScraper = {
    name: 'lefaso',
    url: 'https://lefaso.net/spip.php?rubrique10',
    sourceType: 'MEDIA_LOCAL',
    scrape: jest.fn(),
  }
  return { __esModule: true, default: new Map([['lefaso', mockScraper]]) }
})

const SAMPLE_OFFER = {
  title: 'Développeur Full Stack',
  organization: 'Tech Burkina SARL',
  city: 'Ouagadougou',
  sourceUrl: 'https://lefaso.net/spip.php?article123',
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
}

const PAST_DATE = new Date('2026-01-01T00:00:00.000Z') // expired

const SOURCE_RECORD = { id: 'src-001', name: 'lefaso', url: 'https://lefaso.net' }

describe('runPipeline', () => {
  let mockPrisma: {
    jobOffer: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock }
    source: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock }
    $disconnect: jest.Mock
  }

  let mockScraper: { scrape: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()

    // Fresh mock Prisma instance returned for every new PrismaClient()
    mockPrisma = {
      jobOffer: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      source: {
        // Source active par défaut — pas de circuit breaker déclenché
        findUnique: jest.fn().mockResolvedValue({ ...SOURCE_RECORD, isActive: true, emptyRuns: 0 }),
        upsert: jest.fn().mockResolvedValue(SOURCE_RECORD),
        update: jest.fn().mockResolvedValue({ emptyRuns: 0 }),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    }
    ;(PrismaClient as jest.Mock).mockImplementation(() => mockPrisma)

    // Mock scraper reference
    mockScraper = sources.get('lefaso') as any
  })

  describe('déduplication', () => {
    it('une offre nouvelle est insérée en DB', async () => {
      mockScraper.scrape.mockResolvedValue({
        source: 'lefaso',
        offers: [SAMPLE_OFFER],
        errors: [],
        scrapedAt: new Date(),
      })
      // No existing hashes → offer is new
      mockPrisma.jobOffer.findMany
        .mockResolvedValueOnce([]) // seenSourceUrls query
        .mockResolvedValueOnce([]) // hashes query
        .mockResolvedValueOnce([]) // TTL candidates query
      mockPrisma.jobOffer.create.mockResolvedValue({ id: 'job-001' })
      mockPrisma.jobOffer.updateMany.mockResolvedValue({ count: 0 })

      const result = await runPipeline('lefaso')

      expect(result.totalInserted).toBe(1)
      expect(result.totalDuplicates).toBe(0)
      expect(mockPrisma.jobOffer.create).toHaveBeenCalledTimes(1)
    })

    it('un doublon (même hash en DB) est ignoré', async () => {
      mockScraper.scrape.mockResolvedValue({
        source: 'lefaso',
        offers: [SAMPLE_OFFER],
        errors: [],
        scrapedAt: new Date(),
      })

      // Simulate the same offer already in DB — compute hash to match
      const { createHash } = await import('../src/lib/deduplicator')
      const existingHash = createHash(SAMPLE_OFFER as any)

      mockPrisma.jobOffer.findMany
        .mockResolvedValueOnce([]) // seenSourceUrls query
        .mockResolvedValueOnce([{ hash: existingHash }]) // hash already exists
        .mockResolvedValueOnce([]) // TTL candidates
      mockPrisma.jobOffer.updateMany.mockResolvedValue({ count: 0 })

      const result = await runPipeline('lefaso')

      expect(result.totalInserted).toBe(0)
      expect(result.totalDuplicates).toBe(1)
      expect(mockPrisma.jobOffer.create).not.toHaveBeenCalled()
    })
  })

  describe('expiration TTL', () => {
    it('une offre avec deadline passée est marquée EXPIRED', async () => {
      mockScraper.scrape.mockResolvedValue({
        source: 'lefaso',
        offers: [{ ...SAMPLE_OFFER, deadline: PAST_DATE }],
        errors: [],
        scrapedAt: new Date(),
      })
      mockPrisma.jobOffer.findMany
        .mockResolvedValueOnce([]) // seenSourceUrls query
        .mockResolvedValueOnce([]) // no existing hashes
        .mockResolvedValueOnce([]) // no TTL candidates
      mockPrisma.jobOffer.create.mockResolvedValue({ id: 'job-002' })
      mockPrisma.jobOffer.updateMany.mockResolvedValue({ count: 1 })

      await runPipeline('lefaso')

      expect(mockPrisma.jobOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            deadline: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          data: { status: 'EXPIRED' },
        })
      )
    })

    it('une offre expirée par TTL (sans deadline, > 30j) est marquée EXPIRED', async () => {
      const oldDate = new Date('2025-12-01T00:00:00.000Z') // > 30 days ago
      mockScraper.scrape.mockResolvedValue({
        source: 'lefaso',
        offers: [],
        errors: [],
        scrapedAt: new Date(),
      })
      mockPrisma.jobOffer.findMany
        .mockResolvedValueOnce([]) // seenSourceUrls query
        .mockResolvedValueOnce([]) // no existing hashes
        .mockResolvedValueOnce([{ id: 'old-job', createdAt: oldDate, ttlDays: 30 }]) // stale candidate
      mockPrisma.jobOffer.updateMany.mockResolvedValue({ count: 0 })

      await runPipeline('lefaso')

      // Second updateMany call is for TTL expiry
      expect(mockPrisma.jobOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['old-job'] } }),
          data: { status: 'EXPIRED' },
        })
      )
    })
  })
})
