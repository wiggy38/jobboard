/**
 * content-filter.ts
 *
 * Pré-filtre bon marché (Phase 1) pour écarter les pages qui ne sont
 * manifestement pas des fiches d'offre individuelles (pages de contact,
 * mentions légales, listicles, pages d'agrégation "entreprises qui
 * recrutent en ce moment") AVANT de dépenser un fetch HTTP + un appel Haiku
 * dessus. Ce n'est qu'une première ligne de défense — le jugement sémantique
 * final reste fait par Haiku (ai-extractor.ts, champ isJobOffer).
 */

const URL_SLUG_BLOCKLIST = [
  'contact',
  'mentions-legales',
  'cgu',
  'cgv',
  'qui-sommes-nous',
  'a-propos',
  'apropos',
  'faq',
  'plan-du-site',
  'politique-de-confidentialite',
  'newsletter',
]

const TITLE_BLOCKLIST_PATTERNS = [
  // listicle : "5 règles", "10 conseils" — uniquement si suivi d'un mot-clé
  // de listicle, pour ne pas écarter les vraies offres commençant par un
  // nombre ("50 Agents commerciaux recherchés", "3 Comptables...").
  /^\s*\d+\s+(règles?|conseils?|astuces?|raisons?|choses?|façons?|erreurs?|signes?|secrets?|habitudes?|étapes?|clés?)\b/i,
  /\bconseils?\b/i,
  /\bastuces?\b/i,
  /recrutent en ce moment/i,
  /cette semaine/i,
  /\bpalmar[eè]s\b/i,
  /\bclassement\b/i,
  /^\s*comment\b/i, // article "Comment réussir...", "Comment rédiger..."
  /^\s*pourquoi\b/i,
  /\br[ée]ussir\b/i,
  /entretien d.?embauche/i,
]

export function isLikelyNotJobOffer(title: string, url: string): boolean {
  const lowerUrl = url.toLowerCase()
  if (URL_SLUG_BLOCKLIST.some(slug => lowerUrl.includes(slug))) return true

  const t = title.trim()
  if (TITLE_BLOCKLIST_PATTERNS.some(pattern => pattern.test(t))) return true

  return false
}
