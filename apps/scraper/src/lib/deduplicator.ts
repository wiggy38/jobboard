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
  // Le country est inclus dans le hash pour scoper la déduplication par pays :
  // la colonne hash est unique sur TOUTE la table JobOffer (cf. pipeline.ts),
  // donc deux offres identiques (titre+org+date) publiées dans des pays
  // différents doivent produire des hash distincts, sinon la seconde serait
  // rejetée comme doublon de la première alors qu'il s'agit d'offres réelles
  // distinctes.
  const input =
    normalizeForHash(offer.title) +
    normalizeForHash(offer.organization) +
    normalizeDateForHash(offer.publishedAt) +
    normalizeForHash(offer.country ?? '')
  return cryptoCreateHash('sha256').update(input).digest('hex')
}
