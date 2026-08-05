/**
 * Parse une deadline saisie manuellement (admin/API) — un champ `<input
 * type="date">` n'envoie que "YYYY-MM-DD", ce qui donnerait minuit UTC et
 * exclurait de fait les candidatures déposées le jour même de la clôture.
 * Si l'entrée porte déjà une heure explicite (datetime-local, ISO complet),
 * elle est respectée telle quelle.
 */
export function parseDeadlineInput(raw: string | undefined | null): Date | null {
  if (!raw) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())
  const d = new Date(dateOnly ? `${raw.trim()}T23:59:00` : raw)
  if (isNaN(d.getTime())) return null
  return d
}
