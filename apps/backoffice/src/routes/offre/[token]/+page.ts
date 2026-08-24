import type { PageLoad } from './$types'
import type { TokenizedOffer } from '$lib/types.js'

export const load: PageLoad = async ({ fetch, params, url }) => {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:2999'
  // Le segment de route `[token]` contient en réalité le jobId — voir
  // buildOfferUrl() dans apps/bot/src/services/tokenService.ts, qui génère
  // des liens `/offre/{jobId}?t={token}`. Le vrai token JWT est en query `t`.
  const jobId = params.token
  const jwt = url.searchParams.get('t') ?? ''
  try {
    const res = await fetch(`${apiBase}/api/offre/${jobId}?t=${jwt}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { offer: null, subscribeToken: null, error: (body as { error?: string }).error ?? `Erreur ${res.status}` }
    }
    const body: { job: TokenizedOffer; accessLevel: string; subscribeToken: string | null } = await res.json()
    return {
      offer: body.job,
      accessLevel: body.accessLevel,
      subscribeToken: body.subscribeToken,
      error: null,
      jobId,
      jwt,
      apiBase,
    }
  } catch {
    return {
      offer: null,
      subscribeToken: null,
      error: 'Erreur réseau — réessayez dans quelques instants.',
      jobId,
      jwt,
      apiBase,
    }
  }
}
