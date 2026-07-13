import { createHash as cryptoCreateHash } from 'crypto'
import { RawJobOffer } from '@tumaa/shared'

function normalizeForHash(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Granularité jour (pas l'heure) : l'heure n'est jamais fiable depuis une
// extraction en texte libre (Haiku), donc on l'ignore pour stabiliser le hash.
function normalizeDateForHash(date?: Date): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

export function createHash(offer: RawJobOffer): string {
  const input =
    normalizeForHash(offer.title) +
    normalizeForHash(offer.organization) +
    normalizeDateForHash(offer.publishedAt)
  return cryptoCreateHash('sha256').update(input).digest('hex')
}
