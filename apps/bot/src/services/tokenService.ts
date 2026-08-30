import jwt from 'jsonwebtoken'

interface TokenPayload {
  offerId: string
  userId: string
}

export function generateOfferToken(offerId: string, userId: string): string {
  return jwt.sign({ offerId, userId }, process.env.TOKEN_SECRET!, { expiresIn: '7d' })
}

export function buildOfferUrl(offerId: string, token: string): string {
  const base = process.env.ONBOARDING_BASE_URL ?? process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
  return `${base}/offre/${offerId}?t=${token}`
}

export function verifyOfferToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.TOKEN_SECRET!) as TokenPayload
}

// Lien vers la page récapitulative de la sélection quotidienne (DAILY_DIGEST) —
// même convention que generateOfferToken/buildOfferUrl : le segment de route
// `[token]` est en réalité le pullDeliveryId, le vrai JWT est en `?t=`.
export function generateDigestToken(pullDeliveryId: string, userId: string): string {
  return jwt.sign({ pullDeliveryId, userId }, process.env.TOKEN_SECRET!, { expiresIn: '7d' })
}

export function buildDigestUrl(pullDeliveryId: string, token: string): string {
  const base = process.env.ONBOARDING_BASE_URL ?? process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
  return `${base}/digest/${pullDeliveryId}?t=${token}`
}

// Segment dynamique du bouton URL du template Meta daily_digest_fr — le domaine
// et le chemin /digest/ sont fixés dans la config du bouton côté Meta Business
// Manager (ex: https://app.tumaajob.com/digest/{{1}}), seul ce suffixe varie.
export function buildDigestUrlSuffix(pullDeliveryId: string, token: string): string {
  return `${pullDeliveryId}?t=${token}`
}

export function generateSubscribeToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'subscribe' }, process.env.TOKEN_SECRET!, { expiresIn: '24h' })
}

export function buildSubscribeUrl(token: string): string {
  const base = process.env.ONBOARDING_BASE_URL ?? process.env.WEB_BASE_URL ?? 'https://tumaa.bf'
  return `${base}/subscribe?t=${token}`
}
