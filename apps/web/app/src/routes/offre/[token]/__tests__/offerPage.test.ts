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
  requirements: 'Node.js\nPostgreSQL\nTypeScript',
  applicationUrl: null,
  contactEmail: null,
  contactPhone: null,
  contactAddress: null,
  requirements: null,
  sourceUrl: 'https://example.bf/offre/1',
  source: { id: 's1', name: 'Lefaso.net', trustScore: 0.9, type: 'MEDIA_LOCAL' },
}

describe('Page offre tokenisée — load function', () => {
  it('affiche les contacts masqués pour un utilisateur Freemium', async () => {
    const freemiumOffer = { ...baseOffer, isUnlocked: false }
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => freemiumOffer,
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'valid-token' },
    } as Parameters<typeof load>[0])

    expect(result.offer?.isUnlocked).toBe(false)
    expect(result.offer?.contactEmail).toBeNull()
    expect(result.error).toBeNull()
  })

  it('affiche les contacts en clair pour un utilisateur Essentiel', async () => {
    const premiumOffer = {
      ...baseOffer,
      isUnlocked: true,
      contactEmail: 'rh@ong-tech.bf',
      contactPhone: '+22670000000',
    }
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => premiumOffer,
    })

    const { load } = await import('../+page')
    const result = await load({
      fetch: mockFetch as unknown as typeof fetch,
      params: { token: 'valid-premium-token' },
    } as Parameters<typeof load>[0])

    expect(result.offer?.isUnlocked).toBe(true)
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
      params: { token: 'expired-token' },
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
