// Tests unitaires du chargement de la page offre tokenisée
// Nécessite vitest ou jest + msw pour mocker l'API

const API_BASE = 'http://localhost:3000'

const baseOffer = {
  id: 'offer-123',
  title: 'Développeur Backend',
  organization: 'ONG Tech Burkina',
  city: 'Ouagadougou',
  sector: 'Technologie',
  level: 'Bac+3',
  contractType: 'CDI',
  deadline: null,
  isSponsored: false,
  scoreConfidence: 0.85,
  status: 'ACTIVE',
  publishedAt: '2026-06-01T00:00:00Z',
  description: 'Développement de services backend Node.js.',
  requirements: null,
  applicationUrl: null,
  contactEmail: null,
  contactPhone: null,
  contactAddress: null,
  sourceUrl: 'https://example.bf/offre/1',
  sourceName: 'Lefaso.net',
  sourceTrustScore: 0.9,
}

function makeUrl(query: string) {
  return { searchParams: new URLSearchParams(query) } as unknown as URL
}

describe('Page offre tokenisée — load function', () => {
  it('affiche la source et les contacts pour un plan Premium/Elite (accessLevel FULL)', async () => {
    const offer = { ...baseOffer }
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: offer, accessLevel: 'FULL' }),
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'offer-123' },
      url: makeUrl('t=valid-jwt'),
    } as Parameters<typeof load>[0])

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/offre/offer-123?t=valid-jwt`)
    expect(result.offer?.sourceUrl).toBe('https://example.bf/offre/1')
    expect(result.accessLevel).toBe('FULL')
    expect(result.error).toBeNull()
  })

  it('masque le lien direct pour un utilisateur Freemium (accessLevel FREEMIUM)', async () => {
    const offer = { ...baseOffer, sourceUrl: null }
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: offer, accessLevel: 'FREEMIUM' }),
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'offer-123' },
      url: makeUrl('t=freemium-jwt'),
    } as Parameters<typeof load>[0])

    expect(result.offer?.sourceUrl).toBeNull()
    expect(result.accessLevel).toBe('FREEMIUM')
    expect(result.error).toBeNull()
  })

  it('affiche les contacts en clair quel que soit le plan', async () => {
    const offer = {
      ...baseOffer,
      sourceUrl: null,
      contactEmail: 'rh@ong-tech.bf',
      contactPhone: '+22670000000',
    }
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: offer, accessLevel: 'FREEMIUM' }),
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'offer-123' },
      url: makeUrl('t=valid-jwt'),
    } as Parameters<typeof load>[0])

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/api/offre/offer-123?t=valid-jwt`)
    expect(result.offer?.contactEmail).toBe('rh@ong-tech.bf')
    expect(result.offer?.contactPhone).toBe('+22670000000')
  })

  it('retourne error si l\'offre est expirée (404)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Offre introuvable ou expirée' }),
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'expired-offer' },
      url: makeUrl(''),
    } as Parameters<typeof load>[0])

    expect(result.offer).toBeNull()
    expect(result.error).toBe('Offre introuvable ou expirée')
  })

  it('affiche le badge "Expire bientôt" si deadline < 3 jours', () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const daysLeft = Math.ceil((new Date(soon).getTime() - Date.now()) / 86_400_000)
    expect(daysLeft).toBeLessThan(3)
  })
})
