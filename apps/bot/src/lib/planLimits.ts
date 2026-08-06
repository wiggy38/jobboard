import {
  applyPlanLimits as applyPlanLimitsShared,
  planLimitsForCreate as planLimitsForCreateShared,
  SETTING_KEYS,
  type PrismaProfileLimitsClient,
  type ProfilePlanLimitsFields,
  type UserPlan,
} from '@tumaa/shared';
import { getSetting } from './settings';

// Wrappers autour de packages/shared/src/planLimits.ts qui résolvent les
// limites effectives (éditées en backoffice, sinon PLAN_LIMITS par défaut)
// avant de les appliquer — à utiliser à la place de l'import direct
// @tumaa/shared dès qu'un accès Prisma est disponible.

export async function planLimitsForCreate(plan: UserPlan): Promise<ProfilePlanLimitsFields> {
  const overrides = await getSetting(SETTING_KEYS.PLAN_LIMITS);
  return planLimitsForCreateShared(plan, overrides);
}

export async function applyPlanLimits(
  client: PrismaProfileLimitsClient,
  userId: string,
  plan: UserPlan
): Promise<void> {
  const overrides = await getSetting(SETTING_KEYS.PLAN_LIMITS);
  await applyPlanLimitsShared(client, userId, plan, overrides);
}
