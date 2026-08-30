import type { PageLoad } from './$types'
import type { DigestOffer } from './types'

export const load: PageLoad = async ({ fetch, params, url }) => {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:2999'
  // Comme /offre/[token] (voir apps/bot/src/services/tokenService.ts) : le
  // segment de route `[token]` est en réalité le pullDeliveryId, le vrai JWT
  // est en query `t` — voir buildDigestUrl.
  const pullDeliveryId = params.token
  const jwt = url.searchParams.get('t') ?? ''
  try {
    const res = await fetch(`${apiBase}/api/digest/${pullDeliveryId}?t=${jwt}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { offers: null, error: (body as { error?: string }).error ?? `Erreur ${res.status}` }
    }
    const body: { offers: DigestOffer[]; createdAt: string } = await res.json()
    return {
      offers: body.offers,
      createdAt: body.createdAt,
      error: null,
    }
  } catch {
    return { offers: null, error: 'Erreur réseau — réessayez dans quelques instants.' }
  }
}
