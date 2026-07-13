/**
 * normalizer.ts
 *
 * Pipeline de normalisation des offres d'emploi brutes en deux niveaux :
 *
 *   1. Niveau RÈGLES (synchrone, gratuit, instantané)
 *      Tables de correspondance statiques pour les valeurs connues.
 *      → fonction `normalize()`
 *
 *   2. Niveau IA (asynchrone, Claude Haiku)
 *      Appelé uniquement quand les règles ne suffisent pas (champ absent,
 *      valeur ambiguë, niveau multi-diplôme, etc.).
 *      → fonction `normalizeWithAI()`
 *
 * Le pipeline principal (pipeline.ts) appelle `normalizeWithAI()` ;
 * `normalize()` reste disponible pour les tests unitaires et les dry-runs.
 */

import { RawJobOffer, NormalizedJobOffer } from '@tumaa/shared'
import { createHash } from './deduplicator'
import { aiNormalizeOffer, needsAIEnrichment } from './ai-normalizer'

// ─── Tables de correspondance statiques ──────────────────────────────────────

/**
 * Noms de villes burkinabè : variantes courantes → orthographe officielle.
 * La clé est toujours en minuscules pour faciliter la comparaison.
 */
const CITY_MAP: Record<string, string> = {
  ouaga: 'Ouagadougou',
  ouagadougou: 'Ouagadougou',
  bobo: 'Bobo-Dioulasso',
  'bobo-dioulasso': 'Bobo-Dioulasso',
  koudougou: 'Koudougou',
  banfora: 'Banfora',
}

/**
 * Niveaux d'étude : variantes texte libre → valeur canonique.
 * Haiku utilise ces mêmes valeurs canoniques pour les cas complexes.
 * La clé est en minuscules pour la comparaison insensible à la casse.
 */
const LEVEL_MAP: Record<string, string> = {
  'bac+2': 'BAC+2',
  bts: 'BAC+2',
  dut: 'BAC+2',
  licence: 'BAC+3',
  'bac+3': 'BAC+3',
  'bac+4': 'BAC+4',
  maîtrise: 'BAC+4',
  master: 'BAC+5',
  'master ii': 'BAC+5',
  'master 2': 'BAC+5',
  dess: 'BAC+5',
  dea: 'BAC+5',
  mba: 'BAC+5',
  'bac+5': 'BAC+5',
  'ingénieur': 'BAC+5',
  doctorat: 'Doctorat',
  phd: 'Doctorat',
  bac: 'BAC',
  bepc: 'BEPC',
}

/**
 * Types de contrat : variantes → valeur Prisma/enum.
 * "bénévole" et "volontaire" sont traités comme équivalents (VSI, VNU…).
 */
const CONTRACT_MAP: Record<string, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  stage: 'STAGE',
  alternance: 'ALTERNANCE',
  freelance: 'FREELANCE',
  'bénévole': 'BENEVOLE',
  benevole: 'BENEVOLE',
  volontaire: 'BENEVOLE',
}

// ─── Fonctions de normalisation par champ (règle-based) ──────────────────────

/**
 * Normalise le nom de ville.
 *
 * Cherche la version lowercase dans CITY_MAP.
 * Si absente, retourne la valeur originale telle quelle
 * (Haiku peut la standardiser si needsAIEnrichment() est vrai).
 */
function normalizeCity(city: string): string {
  return CITY_MAP[city.toLowerCase().trim()] ?? city
}

/**
 * Normalise un niveau d'étude SIMPLE (une seule valeur brute).
 *
 * Pour les cas multi-niveaux ("BAC+5 / MASTER II / DESS"),
 * cette fonction ne produit qu'un seul résultat (la première correspondance).
 * L'IA dans `aiNormalizeOffer()` gère le cas multi-niveaux correctement.
 *
 * Retourne "Non précisé" si le niveau est absent ou inconnu de la table.
 */
function normalizeLevel(level?: string): string {
  if (!level) return 'Non précisé'
  // Essai exact (après lowercase + trim)
  const mapped = LEVEL_MAP[level.toLowerCase().trim()]
  if (mapped) return mapped
  // Essai partial : ex "master II spécialisé" contient "master ii"
  const lower = level.toLowerCase()
  for (const [key, value] of Object.entries(LEVEL_MAP)) {
    if (lower.includes(key)) return value
  }
  return level
}

/**
 * Normalise le type de contrat.
 *
 * Retourne "Non précisé" si absent, sinon cherche dans CONTRACT_MAP.
 * La valeur brute est conservée en dernier recours (Haiku peut corriger).
 */
function normalizeContractType(contractType?: string): string {
  if (!contractType) return 'Non précisé'
  return CONTRACT_MAP[contractType.toLowerCase().trim()] ?? contractType
}

// ─── Normalisation synchrone (règle-based) ───────────────────────────────────

/**
 * Normalise une offre brute avec les règles statiques uniquement.
 *
 * Rapide et sans appel réseau. Utilisée comme base dans `normalizeWithAI()`
 * et directement dans les tests / dry-runs.
 *
 * @param offer           L'offre brute issue du scraper
 * @param scoreConfidence Score de qualité de l'extraction (0–1), calculé
 *                        par le pipeline selon les champs présents
 */
export function normalize(offer: RawJobOffer, scoreConfidence = 1): NormalizedJobOffer {
  return {
    ...offer,
    city: normalizeCity(offer.city),
    country: offer.country ?? 'BF',
    // Fallback "Non précisé" si le secteur n'a pas été extrait par le scraper
    sector: offer.sector ?? 'Non précisé',
    level: normalizeLevel(offer.level),
    contractType: normalizeContractType(offer.contractType),
    // Hash SHA-256 pour la déduplication (titre + org + date)
    hash: createHash(offer),
    scoreConfidence,
  }
}

// ─── Normalisation enrichie par l'IA (asynchrone) ────────────────────────────

/**
 * Normalise une offre en deux passes : règles statiques + enrichissement Haiku.
 *
 * Flux :
 *   1. `normalize()` produit une base propre via les tables de correspondance.
 *   2. `needsAIEnrichment()` décide si Haiku doit intervenir (secteur absent,
 *      niveau multi-diplôme, variante inconnue…).
 *   3. Si oui, `aiNormalizeOffer()` appelle Haiku et retourne les champs
 *      normalisés. Seuls les champs NON VIDES de la réponse IA écrasent
 *      la valeur règle-based (principe de fusion conservatrice).
 *
 * En cas d'échec de l'API Anthropic, la normalisation règle-based est
 * retournée sans erreur (le fallback est silencieux).
 *
 * @param offer           L'offre brute issue du scraper
 * @param scoreConfidence Score de qualité de l'extraction (0–1)
 */
export async function normalizeWithAI(
  offer: RawJobOffer,
  scoreConfidence = 1
): Promise<NormalizedJobOffer> {
  // Passe 1 : normalisation règle-based (toujours exécutée, instantanée)
  const base = normalize(offer, scoreConfidence)

  // Court-circuit : si l'offre est déjà complète et simple, pas besoin d'IA
  if (!needsAIEnrichment(offer)) return base

  // Passe 2 : enrichissement IA (asynchrone, peut échouer silencieusement)
  const aiResult = await aiNormalizeOffer(offer)

  // Fusion conservatrice : on n'écrase la valeur règle-based que si
  // l'IA retourne quelque chose de non-vide.
  return {
    ...base,
    // L'IA nettoie l'intitulé du poste (supprime préfixes de recrutement, orga, ville)
    ...(aiResult.title !== undefined ? { title: aiResult.title } : {}),
    // L'IA peut retourner "BAC+3, BAC+5" pour une offre bi-niveau :
    // dans ce cas on remplace la valeur règle-based qui n'aurait vu qu'un seul niveau
    ...(aiResult.level !== undefined ? { level: aiResult.level } : {}),
    // Le secteur est presque toujours inféré par l'IA (rarement extrait par le scraper)
    ...(aiResult.sector !== undefined ? { sector: aiResult.sector } : {}),
    // Le contractType IA prend le dessus si la règle a échoué ("Non précisé")
    ...(aiResult.contractType !== undefined && base.contractType === 'Non précisé'
      ? { contractType: aiResult.contractType }
      : {}),
    // La ville IA est utilisée uniquement si la règle n'a pas trouvé de correspondance
    ...(aiResult.city !== undefined && !CITY_MAP[offer.city?.toLowerCase().trim() ?? '']
      ? { city: aiResult.city }
      : {}),
  }
}
