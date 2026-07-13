/**
 * pagination.ts
 *
 * Aide les scrapers "jobboard" (DETAIL_LIMIT fixe) à répartir leur budget
 * d'extraction Haiku sur plusieurs runs plutôt que de toujours retraiter
 * les mêmes N premières offres de la page de liste.
 *
 * Le pipeline (pipeline.ts) fournit l'ensemble des sourceUrl déjà présentes
 * en base pour cette source. On fait remonter en tête de liste les offres
 * jamais vues (toujours dans l'ordre d'origine, donc les plus récentes
 * d'abord) ; les offres déjà connues ne sont utilisées que pour compléter
 * le budget s'il en reste. Une offre qui dépasse le budget sur un run reste
 * "jamais vue" (elle n'a pas été insérée) et remonte donc prioritaire au
 * run suivant, jusqu'à finir par être traitée.
 */

export function prioritizeUnseen<T>(
  items: T[],
  getSourceUrl: (item: T) => string,
  seenSourceUrls: Set<string>
): T[] {
  const unseen: T[] = []
  const seen: T[] = []

  for (const item of items) {
    if (seenSourceUrls.has(getSourceUrl(item))) seen.push(item)
    else unseen.push(item)
  }

  return [...unseen, ...seen]
}
