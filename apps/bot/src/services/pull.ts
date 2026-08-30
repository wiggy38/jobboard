import { UserPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { planLimitsForCreate } from '../lib/planLimits';

export async function upsertUser(phone: string, referralCode?: string): Promise<{
  id: string;
  plan: string;
  status: string;
  trialUsed: boolean;
}> {
  const freemiumLimits = await planLimitsForCreate('FREEMIUM');

  // Résolution du parrain (forward-only : ne s'applique qu'à la création d'un
  // nouvel utilisateur, jamais à une mise à jour d'un compte existant — pas de
  // récompense pour l'instant, référentiel seulement).
  let referredById: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (referrer) referredById = referrer.id;
  }

  const user = await prisma.user.upsert({
    where: { phone },
    create: {
      phone,
      plan: 'FREEMIUM',
      status: 'ACTIVE',
      trialUsed: false,
      referralCode: crypto.randomUUID().slice(0, 8).toUpperCase(),
      referralCredits: 0,
      ...(referredById ? { referredById } : {}),
      profile: {
        create: {
          cities: [],
          sectors: [],
          levels: [],
          contractTypes: [],
          keywords: [],
          notificationTime: '08:00',
          language: 'fr',
          ...freemiumLimits,
        },
      },
    },
    update: {},
    select: { id: true, plan: true, status: true, trialUsed: true },
  });

  return {
    id: user.id,
    plan: user.plan,
    status: user.status,
    trialUsed: user.trialUsed,
  };
}

export async function recordPullEvent(userId: string, offersCount = 0): Promise<void> {
  const date = new Date(new Date().toISOString().split('T')[0]);

  await prisma.$executeRaw`
    INSERT INTO "PullEvent" ("id", "userId", "date", "offersCount", "createdAt")
    VALUES (gen_random_uuid(), ${userId}, ${date}::date, ${offersCount}, NOW())
    ON CONFLICT ("userId", "date")
    DO UPDATE SET "offersCount" = "PullEvent"."offersCount" + ${offersCount}
  `;
}

export async function recordPullDelivery(
  userId: string,
  command: 'OFFRES' | 'SUITE' | 'DAILY_DIGEST',
  offerIds: string[],
  plan: UserPlan,
): Promise<{ id: string }> {
  return prisma.pullDelivery.create({
    data: {
      userId,
      command,
      offersCount: offerIds.length,
      offers: { connect: offerIds.map((id) => ({ id })) },
      planAtPull: plan,
    },
    select: { id: true },
  });
}

export async function getUserWithProfile(phone: string): Promise<{
  id: string;
  plan: string;
  status: string;
  countries: string[];
  profile: {
    cities: string[];
    sectors: string[];
    levels: string[];
    contractTypes: string[];
    keywords: string[];
    notificationTime: string;
    language: string;
  } | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      plan: true,
      status: true,
      countries: true,
      profile: {
        select: {
          cities: true,
          sectors: true,
          levels: true,
          contractTypes: true,
          keywords: true,
          notificationTime: true,
          language: true,
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    plan: user.plan,
    status: user.status,
    countries: user.countries,
    profile: user.profile,
  };
}
