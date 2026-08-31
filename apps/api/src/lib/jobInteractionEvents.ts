// Une ligne JobInteraction peut désormais porter plusieurs actions à la fois
// (ex: un utilisateur qui a vu ET partagé la même offre) — ces helpers
// déplient les colonnes *At en événements individuels pour les vues admin
// qui affichent un historique (liste paginée d'événements), et fournissent
// un agrégat de comptage par action pour les vues qui affichent des totaux.
//
// ACTION_COLUMN_MAP est la seule source de vérité colonne<->action ; tout le
// SQL généré ci-dessous n'interpole QUE ces noms de colonnes fixes (jamais
// une valeur venant d'une requête utilisateur), donc pas de risque
// d'injection malgré l'usage de $queryRawUnsafe pour les noms dynamiques.
export const ACTION_COLUMN_MAP = {
  SEEN: 'seenAt',
  CLICKED_SOURCE: 'clickedSourceAt',
  CLICKED_LOCKED: 'clickedLockedAt',
  UNLOCKED: 'unlockedAt',
  BOOKMARKED: 'bookmarkedAt',
  REPORTED_FRAUD: 'reportedFraudAt',
  SHARED: 'sharedAt',
} as const

export type InteractionAction = keyof typeof ACTION_COLUMN_MAP

export const INTERACTION_ACTIONS = Object.keys(ACTION_COLUMN_MAP) as InteractionAction[]

// Sous-requête (sans alias) qui déplie chaque colonne *At en une ligne
// d'événement { id, userId, jobId, action, event_at }, une branche UNION ALL
// par action demandée (WHERE col IS NOT NULL pour ignorer les événements qui
// n'ont pas eu lieu). Appelant : entourer d'un alias, ex. `(${sql}) events`.
export function buildInteractionEventsUnion(actions: readonly InteractionAction[] = INTERACTION_ACTIONS): string {
  return actions
    .map(
      (action) => `
        SELECT "id", "userId", "jobId", '${action}' AS action, "${ACTION_COLUMN_MAP[action]}" AS event_at
        FROM "JobInteraction" WHERE "${ACTION_COLUMN_MAP[action]}" IS NOT NULL
      `
    )
    .join(' UNION ALL ')
}

// Liste `COUNT(col) AS "ACTION", ...` à insérer dans un SELECT — COUNT sur
// une colonne nullable ignore les NULL, donc reproduit exactement l'ancien
// comptage par action (groupBy action / count).
export function buildInteractionCountsSelect(actions: readonly InteractionAction[] = INTERACTION_ACTIONS): string {
  return actions.map((action) => `COUNT("${ACTION_COLUMN_MAP[action]}") AS "${action}"`).join(', ')
}
