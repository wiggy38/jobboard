export type UserPlan = 'FREEMIUM' | 'PREMIUM' | 'ELITE'

// Valeur sentinelle stockable en colonne Postgres Int pour représenter "illimité".
export const UNLIMITED = 999

export interface PlanLimits {
  maxCities: number
  maxSectors: number
  maxContractGroups: number
  maxCountries: number
  keywordAlertsEnabled: boolean
}

// Source de vérité unique pour les limites par plan. Toute modification de la
// grille tarifaire se fait ici — voir applyPlanLimits()/planLimitsForCreate()
// dans packages/db pour la synchronisation vers Profile.
export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  FREEMIUM: {
    maxCities: 1,
    maxSectors: 1,
    maxContractGroups: 1,
    maxCountries: 1,
    keywordAlertsEnabled: false,
  },
  PREMIUM: {
    maxCities: 3,
    maxSectors: 3,
    maxContractGroups: 3,
    maxCountries: 1,
    keywordAlertsEnabled: true,
  },
  ELITE: {
    maxCities: UNLIMITED,
    maxSectors: UNLIMITED,
    maxContractGroups: UNLIMITED,
    maxCountries: 3,
    keywordAlertsEnabled: true,
  },
}

export const ELITE_MAX_COUNTRIES = PLAN_LIMITS.ELITE.maxCountries

export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED
}

export interface ProfilePlanLimitsFields {
  maxCities: number
  maxSectors: number
  maxContractGroups: number
  maxCountries: number
  keywordAlertsEnabled: boolean
}

export function planLimitsForCreate(plan: UserPlan): ProfilePlanLimitsFields {
  const limits = PLAN_LIMITS[plan]
  return {
    maxCities: limits.maxCities,
    maxSectors: limits.maxSectors,
    maxContractGroups: limits.maxContractGroups,
    maxCountries: limits.maxCountries,
    keywordAlertsEnabled: limits.keywordAlertsEnabled,
  }
}

// Interface minimale (structurellement compatible avec PrismaClient) pour éviter
// de coupler ce package à @prisma/client — n'importe quel client Prisma généré
// satisfait cette forme.
export interface PrismaProfileLimitsClient {
  profile: {
    update(args: { where: { userId: string }; data: ProfilePlanLimitsFields }): Promise<unknown>
  }
}

// Synchronise les limites du plan sur un Profile existant. À appeler après tout
// changement de User.plan (paiement, essai, etc.) — jamais avant, sinon le
// Profile n'existe pas encore : utiliser planLimitsForCreate() dans ce cas.
export async function applyPlanLimits(
  client: PrismaProfileLimitsClient,
  userId: string,
  plan: UserPlan
): Promise<void> {
  await client.profile.update({
    where: { userId },
    data: planLimitsForCreate(plan),
  })
}
