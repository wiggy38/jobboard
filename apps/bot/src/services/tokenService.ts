import jwt from 'jsonwebtoken'

interface TokenPayload {
  offerId: string
  userId: string
}

export function generateOfferToken(offerId: string, userId: string): string {
  return jwt.sign({ offerId, userId }, process.env.TOKEN_SECRET!, { expiresIn: '7d' })
}

export function buildOfferUrl(offerId: string, token: string): string {
  const base = process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
  return `${base}/offre/${offerId}?t=${token}`
}

export function verifyOfferToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.TOKEN_SECRET!) as TokenPayload
}

export function generateSubscribeToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'subscribe' }, process.env.TOKEN_SECRET!, { expiresIn: '24h' })
}

export function buildSubscribeUrl(token: string): string {
  const base = process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
  return `${base}/subscribe?t=${token}`
}
