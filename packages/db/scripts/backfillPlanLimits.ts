// Backfill one-off : synchronise Profile.maxCities/maxSectors/maxContractGroups/
// maxCountries/keywordAlertsEnabled pour tous les utilisateurs existants, dont les
// Profile PREMIUM/ELITE resteraient sinon aux défauts FREEMIUM (voir migration
// add_profile_plan_limits) jusqu'à leur prochain changement de plan.
//
// Lit la grille de limites depuis la table Setting ('plans.limits', éditable en
// backoffice sur /admin/parametres) plutôt que le PLAN_LIMITS statique de
// @tumaa/shared : les deux divergent dès qu'un admin modifie la grille en prod
// (ex. FREEMIUM.maxCities réduit à 1), et rejouer le backfill avec le défaut
// statique écraserait ce réglage plutôt que de le propager. À ré-exécuter après
// toute modification de la grille en backoffice — sinon les comptes créés avant
// le changement gardent leurs anciennes limites en cache et /api/subscribe/profile
// rejette (PROFILE_INVALID) toute sélection valide selon les limites affichées
// côté front (qui, elles, lisent toujours la valeur live).
// Exécution manuelle unique : pnpm --filter @tumaa/db exec ts-node scripts/backfillPlanLimits.ts
import { PrismaClient } from '@prisma/client';
import { applyPlanLimits, DEFAULT_SETTINGS, SETTING_KEYS, type PlanLimits, type UserPlan } from '@tumaa/shared';

const prisma = new PrismaClient();

async function main() {
  const settingRow = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.PLAN_LIMITS } });
  const overrides = (settingRow ? settingRow.value : DEFAULT_SETTINGS[SETTING_KEYS.PLAN_LIMITS]) as Record<
    UserPlan,
    PlanLimits
  >;

  const users = await prisma.user.findMany({
    select: { id: true, plan: true },
  });

  let updated = 0;
  for (const user of users) {
    try {
      await applyPlanLimits(prisma, user.id, user.plan, overrides);
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
