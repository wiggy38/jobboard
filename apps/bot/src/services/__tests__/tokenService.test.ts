import jwt from 'jsonwebtoken'

const SECRET = 'tumaa_test_secret_32_chars_minimum'

beforeAll(() => {
  process.env.TOKEN_SECRET = SECRET
  process.env.WEB_BASE_URL = 'https://tumaa.bf'
})

// Import après avoir défini les env vars
let generateOfferToken: (offerId: string, userId: string) => string
let buildOfferUrl: (offerId: string, token: string) => string
let verifyOfferToken: (token: string) => { offerId: string; userId: string }

beforeAll(async () => {
  const mod = await import('../tokenService')
  generateOfferToken = mod.generateOfferToken
  buildOfferUrl = mod.buildOfferUrl
  verifyOfferToken = mod.verifyOfferToken
})

describe('tokenService', () => {
  it('génère un token JWT valide avec offerId et userId', () => {
    const token = generateOfferToken('offer-123', 'user-456')
    expect(typeof token).toBe('string')
    const decoded = jwt.verify(token, SECRET) as { offerId: string; userId: string; exp: number }
    expect(decoded.offerId).toBe('offer-123')
    expect(decoded.userId).toBe('user-456')
    // expire dans ~7 jours
    const sevenDays = 7 * 24 * 3600
    expect(decoded.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(sevenDays - 60)
  })

  it('buildOfferUrl retourne l\'URL correcte', () => {
    const url = buildOfferUrl('offer-123', 'abc123token')
    expect(url).toBe('https://tumaa.bf/offre/offer-123?t=abc123token')
  })

  it('verifyOfferToken décode correctement un token valide', () => {
    const token = generateOfferToken('offer-xyz', 'user-abc')
    const payload = verifyOfferToken(token)
    expect(payload.offerId).toBe('offer-xyz')
    expect(payload.userId).toBe('user-abc')
  })

  it('un token expiré (> 7j) est rejeté par verifyOfferToken', () => {
    const expiredToken = jwt.sign(
      { offerId: 'offer-123', userId: 'user-456' },
      SECRET,
      { expiresIn: '-1s' },
    )
    expect(() => verifyOfferToken(expiredToken)).toThrow()
  })

  it('un token signé avec un mauvais secret est rejeté', () => {
    const badToken = jwt.sign(
      { offerId: 'offer-123', userId: 'user-456' },
      'wrong_secret',
      { expiresIn: '7d' },
    )
    expect(() => verifyOfferToken(badToken)).toThrow()
  })
})
