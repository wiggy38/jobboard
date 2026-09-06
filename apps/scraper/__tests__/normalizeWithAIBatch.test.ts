import { RawJobOffer, SECTOR_OPTIONS } from '@tumaa/shared'

jest.mock('../src/lib/settings', () => ({
  getSetting: jest.fn(),
}))

jest.mock('../src/lib/ai-normalizer', () => {
  const actual = jest.requireActual('../src/lib/ai-normalizer')
  return {
    ...actual,
    aiNormalizeOffers: jest.fn(),
  }
})

import { normalizeWithAIBatch } from '../src/lib/normalizer'
import { getSetting } from '../src/lib/settings'
import { aiNormalizeOffers, AI_NORMALIZE_BATCH_SIZE } from '../src/lib/ai-normalizer'

const mockGetSetting = getSetting as jest.Mock
const mockAiNormalizeOffers = aiNormalizeOffers as jest.Mock

// Une offre sans secteur déclenche toujours needsAIEnrichment (voir ai-normalizer.ts)
function makeOffer(overrides: Partial<RawJobOffer> = {}): RawJobOffer {
  return {
    title: 'Poste',
    organization: 'Organisation Test',
    city: 'Ouagadougou',
    sourceUrl: `https://example.com/job/${Math.random()}`,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSetting.mockResolvedValue(SECTOR_OPTIONS)
  mockAiNormalizeOffers.mockResolvedValue(new Map())
})

describe('normalizeWithAIBatch — chunking', () => {
  it("découpe un lot nécessitant l'IA en chunks de AI_NORMALIZE_BATCH_SIZE", async () => {
    const offers = Array.from({ length: 25 }, (_, i) => makeOffer({ title: `Poste ${i}` }))

    await normalizeWithAIBatch(offers, offers.map(() => 1))

    expect(mockAiNormalizeOffers).toHaveBeenCalledTimes(Math.ceil(25 / AI_NORMALIZE_BATCH_SIZE))
    expect(mockAiNormalizeOffers.mock.calls[0][0]).toHaveLength(AI_NORMALIZE_BATCH_SIZE)
    expect(mockAiNormalizeOffers.mock.calls[1][0]).toHaveLength(AI_NORMALIZE_BATCH_SIZE)
    expect(mockAiNormalizeOffers.mock.calls[2][0]).toHaveLength(25 - 2 * AI_NORMALIZE_BATCH_SIZE)
  })

  it("n'appelle pas l'IA pour les offres qui n'en ont pas besoin", async () => {
    const offer = makeOffer({ sector: 'Informatique', organization: 'Tech Burkina SARL', level: 'BAC+5' })

    const result = await normalizeWithAIBatch([offer], [1])

    expect(mockAiNormalizeOffers).not.toHaveBeenCalled()
    expect(result[0].sector).toBe('Informatique')
  })

  it('lot vide → aucun appel, tableau vide', async () => {
    const result = await normalizeWithAIBatch([], [])
    expect(mockAiNormalizeOffers).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })
})

describe('normalizeWithAIBatch — ré-alignement des résultats sur la bonne offre', () => {
  it('applique le résultat IA à la bonne offre du chunk, laisse les autres en fallback', async () => {
    const offerA = makeOffer({ title: 'Chauffeur' })
    const offerB = makeOffer({ title: 'Recrutement Comptable Senior' })

    // Haiku ne renvoie une correction que pour la 2e offre du chunk (position 1)
    mockAiNormalizeOffers.mockResolvedValueOnce(new Map([[1, { title: 'Comptable Senior' }]]))

    const result = await normalizeWithAIBatch([offerA, offerB], [1, 1])

    expect(result[0].title).toBe('Chauffeur') // pas de correction IA → base règle-based inchangée
    expect(result[1].title).toBe('Comptable Senior') // correction IA appliquée à la bonne offre
  })

  it('offre absente de la Map (Haiku ne l’a pas retournée) retombe sur le fallback règle-based', async () => {
    const offer = makeOffer({ title: 'Poste Ambigu' })
    mockAiNormalizeOffers.mockResolvedValueOnce(new Map()) // équivalent à un échec API/Haiku muet

    const result = await normalizeWithAIBatch([offer], [1])

    expect(result[0].title).toBe('Poste Ambigu')
    expect(result[0].sector).toBe('Non précisé')
  })

  it('conserve l’ordre d’entrée dans le tableau de sortie', async () => {
    const offers = [makeOffer({ title: 'A' }), makeOffer({ title: 'B' }), makeOffer({ title: 'C' })]

    const result = await normalizeWithAIBatch(offers, [1, 1, 1])

    expect(result.map(o => o.title)).toEqual(['A', 'B', 'C'])
  })
})

describe('normalizeWithAIBatch — allowedSectors récupéré une seule fois', () => {
  it('appelle getSetting une seule fois pour tout le lot, quel que soit le nombre d’offres', async () => {
    const offers = Array.from({ length: 12 }, (_, i) => makeOffer({ title: `Poste ${i}` }))

    await normalizeWithAIBatch(offers, offers.map(() => 1))

    expect(mockGetSetting).toHaveBeenCalledTimes(1)
  })
})
