-- AlterTable
ALTER TABLE "JobInteraction"
  ADD COLUMN "seenAt" TIMESTAMP(3),
  ADD COLUMN "clickedSourceAt" TIMESTAMP(3),
  ADD COLUMN "clickedLockedAt" TIMESTAMP(3),
  ADD COLUMN "unlockedAt" TIMESTAMP(3),
  ADD COLUMN "bookmarkedAt" TIMESTAMP(3),
  ADD COLUMN "reportedFraudAt" TIMESTAMP(3),
  ADD COLUMN "sharedAt" TIMESTAMP(3);

-- DataMigration: pivote les lignes existantes (une par userId/jobId/action) en
-- une seule ligne "survivante" par (userId, jobId) — la ligne de plus petit id.
-- COALESCE garantit qu'on ne recopie jamais par-dessus une colonne déjà posée
-- (idempotent si la migration est rejouée).
WITH ranked AS (
  SELECT
    "id", "userId", "jobId", "action", "createdAt",
    FIRST_VALUE("id") OVER (PARTITION BY "userId", "jobId" ORDER BY "id") AS survivor_id
  FROM "JobInteraction"
)
UPDATE "JobInteraction" t
SET
  "seenAt"          = COALESCE(t."seenAt",          (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'SEEN')),
  "clickedSourceAt" = COALESCE(t."clickedSourceAt", (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'CLICKED_SOURCE')),
  "clickedLockedAt" = COALESCE(t."clickedLockedAt", (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'CLICKED_LOCKED')),
  "unlockedAt"      = COALESCE(t."unlockedAt",      (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'UNLOCKED')),
  "bookmarkedAt"    = COALESCE(t."bookmarkedAt",    (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'BOOKMARKED')),
  "reportedFraudAt" = COALESCE(t."reportedFraudAt", (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'REPORTED_FRAUD')),
  "sharedAt"        = COALESCE(t."sharedAt",        (SELECT "createdAt" FROM ranked WHERE ranked.survivor_id = t.id AND ranked.action = 'SHARED'))
WHERE t.id IN (SELECT survivor_id FROM ranked);

-- DataMigration: supprime les lignes non survivantes, leur action a déjà été
-- repliée dans la ligne survivante ci-dessus.
DELETE FROM "JobInteraction" a
USING "JobInteraction" b
WHERE a."userId" = b."userId"
  AND a."jobId" = b."jobId"
  AND a."id" > b."id";

-- DropIndex
DROP INDEX "JobInteraction_userId_jobId_action_key";

-- AlterTable
ALTER TABLE "JobInteraction" DROP COLUMN "action";

-- CreateIndex
CREATE UNIQUE INDEX "JobInteraction_userId_jobId_key" ON "JobInteraction"("userId", "jobId");
