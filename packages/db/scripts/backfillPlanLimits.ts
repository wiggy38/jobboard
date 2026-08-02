// Backfill one-off : synchronise Profile.maxCities/maxSectors/maxContractGroups/
// maxCountries/keywordAlertsEnabled pour tous les utilisateurs existants, dont les
// Profile PREMIUM/ELITE resteraient sinon aux défauts FREEMIUM (voir migration
// add_profile_plan_limits) jusqu'à leur prochain changement de plan.
// Exécution manuelle unique : pnpm --filter @tumaa/db exec ts-node scripts/backfillPlanLimits.ts
import { PrismaClient } from '@prisma/client';
import { applyPlanLimits } from '@tumaa/shared';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, plan: true },
  });

  let updated = 0;
  for (const user of users) {
    try {
      await applyPlanLimits(prisma, user.id, user.plan);
      updated++;
    } catch (err) {
      console.warn(`[backfillPlanLimits] échec pour user ${user.id} (pas de Profile ?):`, err);
    }
  }

  console.log(`✓ Limites de plan resynchronisées pour ${updated}/${users.length} utilisateurs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
