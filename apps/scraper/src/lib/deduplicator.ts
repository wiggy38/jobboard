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

// --- Détection de quasi-doublons inter-sources ---
//
// Le hash ci-dessus est un match EXACT : deux extractions Haiku indépendantes
// (une par scraper, cf. ai-extractor.ts) sur deux HTML différents pour la même
// annonce produisent souvent un titre/organisation légèrement différent
// ("Recrutement d'un Comptable (H/F)" vs "Comptable"), donc deux hash
// distincts alors qu'il s'agit de la même offre réelle. Ce qui suit ajoute une
// détection floue, volontairement appliquée APRÈS l'enrichissement IA (champs
// mieux nettoyés) et non à la place du hash exact (qui reste la 1ère ligne de
// défense bon marché, avant tout appel Haiku).

export const TITLE_SIMILARITY_THRESHOLD = 0.85
export const ORG_SIMILARITY_THRESHOLD = 0.7

// Retire accents/ponctuation/mentions parasites en plus de normalizeForHash,
// pour que le score de similarité ne soit pas faussé par des variations de
// forme sans rapport avec le fond ("(H/F)", guillemets, tirets multiples...).
export function normalizeForSimilarity(value: string): string {
  return normalizeForHash(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(h\s*\/\s*f\)|\(f\s*\/\s*h\)/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Comparé après normalizeForSimilarity (accents/casse déjà retirés) — ne pas
// comparer contre le littéral accentué "non précisé".
const NON_PRECISE_ORG = normalizeForSimilarity('Non précisé')

function bigrams(value: string): string[] {
  if (value.length < 2) return [value]
  const result: string[] = []
  for (let i = 0; i < value.length - 1; i++) {
    result.push(value.slice(i, i + 2))
  }
  return result
}

// Coefficient de Dice sur bigrammes de caractères : mesure de similarité
// simple, robuste aux reformulations, sans dépendance npm (packages/matching
// est également "pur TS sans dépendances").
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigramsA = bigrams(a)
  const bigramsB = bigrams(b)
  const countsB = new Map<string, number>()
  for (const bg of bigramsB) {
    countsB.set(bg, (countsB.get(bg) ?? 0) + 1)
  }

  let intersection = 0
  for (const bg of bigramsA) {
    const remaining = countsB.get(bg) ?? 0
    if (remaining > 0) {
      intersection++
      countsB.set(bg, remaining - 1)
    }
  }

  return (2 * intersection) / (bigramsA.length + bigramsB.length)
}

export interface NearDuplicateCandidate {
  id: string
  title: string
  organization: string
  country: string
  deadline?: Date | null
  publishedAt?: Date | null
}

function sameDay(a?: Date | null, b?: Date | null): boolean {
  if (!a || !b) return false
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

export function isNearDuplicate(
  candidate: Pick<RawJobOffer, 'title' | 'organization' | 'country' | 'deadline'>,
  existing: NearDuplicateCandidate
): boolean {
  if ((candidate.country ?? '') !== existing.country) return false

  const titleScore = diceCoefficient(
    normalizeForSimilarity(candidate.title),
    normalizeForSimilarity(existing.title)
  )
  if (titleScore < TITLE_SIMILARITY_THRESHOLD) return false

  const orgA = normalizeForSimilarity(candidate.organization)
  const orgB = normalizeForSimilarity(existing.organization)
  const orgMatches =
    orgA === NON_PRECISE_ORG ||
    orgB === NON_PRECISE_ORG ||
    diceCoefficient(orgA, orgB) >= ORG_SIMILARITY_THRESHOLD
  if (!orgMatches) return false

  // Si les deux deadlines sont renseignées, elles doivent coïncider (même
  // jour) — sinon ce critère est ignoré (pas de repli sur publishedAt, jugée
  // trop peu fiable d'un scraper à l'autre pour servir de signal de date) et
  // le match repose uniquement sur titre + organisation + pays.
  if (candidate.deadline && existing.deadline) {
    return sameDay(candidate.deadline, existing.deadline)
  }

  return true
}

export function findNearDuplicate(
  candidate: Pick<RawJobOffer, 'title' | 'organization' | 'country' | 'deadline'>,
  existingOffers: NearDuplicateCandidate[]
): NearDuplicateCandidate | undefined {
  return existingOffers.find(existing => isNearDuplicate(candidate, existing))
}
