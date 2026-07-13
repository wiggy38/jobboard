import { prisma } from '../lib/prisma';

export async function upsertUser(phone: string): Promise<{
  id: string;
  plan: string;
  status: string;
  trialUsed: boolean;
}> {
  const user = await prisma.user.upsert({
    where: { phone },
    create: {
      phone,
      plan: 'FREEMIUM',
      status: 'ACTIVE',
      trialUsed: false,
      referralCode: crypto.randomUUID().slice(0, 8).toUpperCase(),
      referralCredits: 0,
      profile: {
        create: {
          cities: [],
          sectors: [],
          levels: [],
          contractTypes: [],
          keywords: [],
          notificationTime: '08:00',
          language: 'fr',
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

export async function recordPullEvent(userId: string): Promise<void> {
  const date = new Date(new Date().toISOString().split('T')[0]);

  await prisma.$executeRaw`
    INSERT INTO "PullEvent" ("id", "userId", "date", "createdAt")
    VALUES (gen_random_uuid(), ${userId}, ${date}::date, NOW())
    ON CONFLICT ("userId", "date") DO NOTHING
  `;
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
