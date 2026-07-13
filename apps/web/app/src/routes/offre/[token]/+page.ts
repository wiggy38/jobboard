import type { PageLoad } from './$types'
import type { TokenizedOffer } from '$lib/types.js'

export const load: PageLoad = async ({ fetch, params }) => {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${apiBase}/offers/token/${params.token}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { offer: null, error: (body as { error?: string }).error ?? `Erreur ${res.status}` }
    }
    const offer: TokenizedOffer = await res.json()
    return { offer, error: null }
  } catch {
    return { offer: null, error: 'Erreur réseau — réessayez dans quelques instants.' }
  }
}
