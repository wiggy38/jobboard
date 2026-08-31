import { prisma } from './prisma'

const INTERACTION_COLUMNS = [
  'seenAt',
  'clickedSourceAt',
  'clickedLockedAt',
  'unlockedAt',
  'bookmarkedAt',
  'reportedFraudAt',
  'sharedAt',
] as const

export type InteractionColumn = (typeof INTERACTION_COLUMNS)[number]

// Enregistre l'horodatage d'une action utilisateur sur une offre, en ne
// gardant que la PREMIÈRE occurrence de cette action — reproduit le
// comportement de l'ancien .create().catch(()=>{}) qui s'appuyait sur la
// violation de la contrainte unique (userId,jobId,action) pour ignorer les
// doublons. Une ligne existe désormais par (userId,jobId) et peut être créée
// par n'importe quelle action en premier, donc on ne doit jamais écraser une
// colonne déjà renseignée, quel que soit l'ordre d'arrivée des actions.
//
// `column` est restreint au type union ci-dessus (whitelist compile-time) :
// même si $executeRawUnsafe interpole le nom de colonne, aucune chaîne
// arbitraire ne peut jamais y arriver — userId/jobId/id restent paramétrés.
export async function recordJobInteraction(
  userId: string,
  jobId: string,
  column: InteractionColumn,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "JobInteraction" ("id", "userId", "jobId", "${column}")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("userId", "jobId")
     DO UPDATE SET "${column}" = COALESCE("JobInteraction"."${column}", EXCLUDED."${column}")`,
    crypto.randomUUID(),
    userId,
    jobId,
  )
}
