/**
 * afriqueemplois-category.ts
 *
 * Helpers partagés par les deux scrapers afriqueemplois (BF et BJ, quasi-clones
 * l'un de l'autre) pour exploiter les champs déjà présents dans le payload de
 * `/api/load-more` mais jusqu'ici ignorés :
 *
 *  - `category_name` porte le niveau d'études de l'annonce (badge visible en
 *    tête de chaque carte sur le site) : "Niveau BAC+3", "Niveau BEPC"…
 *    Certaines catégories ne sont pas des niveaux ("Stages", "Autres",
 *    "International", "Multiple", "Non Précisé") — dans ce cas on ne devine
 *    rien et on laisse l'enrichissement IA du pipeline trancher.
 *  - `news_description` contient le texte complet de l'annonce, seul matériau
 *    exploitable pour les offres au-delà du budget Haiku par fiche.
 */

/** Valeurs canoniques attendues en aval (cf. CANONICAL_LEVELS, ai-normalizer.ts). */
const CATEGORY_LEVEL_PATTERN = /niveau\s+(cep|bepc|bac\s*\+\s*([1-5])|bac|doctorat)/i

/**
 * Extrait le niveau d'études canonique du libellé de catégorie.
 * Retourne `undefined` pour toute catégorie qui n'exprime pas un niveau.
 */
export function levelFromCategory(categoryName?: string): string | undefined {
  if (!categoryName) return undefined

  const match = categoryName.match(CATEGORY_LEVEL_PATTERN)
  if (!match) return undefined

  const [, raw, plus] = match
  if (plus) return `BAC+${plus}`

  const normalized = raw.toLowerCase()
  if (normalized === 'doctorat') return 'Doctorat'
  return normalized.toUpperCase() // CEP, BEPC, BAC
}

/**
 * Déduit le type de contrat du libellé de catégorie.
 * Seule la catégorie "Stages" est un type de contrat ; les autres décrivent un
 * niveau ou un fourre-tout.
 */
export function contractTypeFromCategory(categoryName?: string): string | undefined {
  if (!categoryName) return undefined
  return /^\s*stages?\s*$/i.test(categoryName) ? 'STAGE' : undefined
}

/**
 * Longueur max du texte d'annonce transporté dans `RawJobOffer.description`.
 * L'enrichissement IA n'envoie de toute façon que le début + la fin du champ
 * (`buildUserMessage`, ai-normalizer.ts) et `normalize()` tronque à 100
 * caractères la valeur finalement stockée — cette borne évite seulement de
 * promener plusieurs Ko de texte dans tout le pipeline.
 */
const DESCRIPTION_SOURCE_MAX_LENGTH = 1200

/**
 * Prépare le texte de l'annonce pour `RawJobOffer.description`.
 * Retourne `undefined` si le texte est vide.
 */
export function descriptionFromPageText(pageText?: string): string | undefined {
  const trimmed = pageText?.trim()
  if (!trimmed) return undefined
  return trimmed.length > DESCRIPTION_SOURCE_MAX_LENGTH
    ? trimmed.slice(0, DESCRIPTION_SOURCE_MAX_LENGTH).trimEnd()
    : trimmed
}
