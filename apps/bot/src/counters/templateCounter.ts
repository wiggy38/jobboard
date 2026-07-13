import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { TemplateType as PrismaTemplateType } from '@prisma/client';
import { isDormant } from './dormancyGuard';

export type TemplateType = 'RELANCE' | 'MATCH_PARFAIT' | 'NUDGE_PREMIUM';

const CAPS: Record<TemplateType, number> = {
  RELANCE: 2,
  MATCH_PARFAIT: 1,
  NUDGE_PREMIUM: 1,
};

const GLOBAL_CAP = 3;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

// Seconds until midnight on the 1st of next month
function secondsUntilMonthEnd(): number {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);
}

function typeKey(userId: string, month: string, type: TemplateType): string {
  return `template:${userId}:${month}:${type}`;
}

function totalKey(userId: string, month: string): string {
  return `template:${userId}:${month}:total`;
}

// -------------------------------------------------------------------
// Redis read path
// -------------------------------------------------------------------

async function checkViaRedis(
  userId: string,
  type: TemplateType,
  month: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const [totalVal, typeVal] = await redis.mget(
    totalKey(userId, month),
    typeKey(userId, month, type),
  );
  const totalCount = parseInt(totalVal ?? '0', 10);
  const typeCount = parseInt(typeVal ?? '0', 10);

  if (totalCount >= GLOBAL_CAP) return { allowed: false, reason: 'CAP_GLOBAL' };
  if (typeCount >= CAPS[type]) return { allowed: false, reason: 'CAP_TYPE' };
  return { allowed: true };
}

// -------------------------------------------------------------------
// PG-only fallback (when Redis is down)
// -------------------------------------------------------------------

async function checkViaPg(
  userId: string,
  type: TemplateType,
  month: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const [typeRow, allRows] = await Promise.all([
    prisma.templateCounter.findUnique({
      where: { userId_month_type: { userId, month, type } },
    }),
    prisma.templateCounter.findMany({
      where: { userId, month },
      select: { count: true },
    }),
  ]);

  const typeCount = typeRow?.count ?? 0;
  const totalCount = allRows.reduce((sum, r) => sum + r.count, 0);

  if (totalCount >= GLOBAL_CAP) return { allowed: false, reason: 'CAP_GLOBAL' };
  if (typeCount >= CAPS[type]) return { allowed: false, reason: 'CAP_TYPE' };
  return { allowed: true };
}

// -------------------------------------------------------------------
// Increment helpers
// -------------------------------------------------------------------

async function incrementRedis(userId: string, type: TemplateType, month: string): Promise<void> {
  const ttl = secondsUntilMonthEnd();
  const tKey = typeKey(userId, month, type);
  const gKey = totalKey(userId, month);

  await redis
    .multi()
    .incr(tKey)
    .expire(tKey, ttl)
    .incr(gKey)
    .expire(gKey, ttl)
    .exec();
}

export async function incrementTemplateCounter(userId: string, type: string): Promise<void> {
  const month = currentMonth();
  try {
    await incrementRedis(userId, type as TemplateType, month);
  } catch (err) {
    console.error(JSON.stringify({ event: 'redis_increment_failed', userId, type, err: String(err) }));
  }
  await prisma.$transaction([
    prisma.templateCounter.upsert({
      where: { userId_month_type: { userId, month, type: type as PrismaTemplateType } },
      create: { userId, month, type: type as PrismaTemplateType, count: 1 },
      update: { count: { increment: 1 } },
    }),
  ]);
}

// -------------------------------------------------------------------
// Main export
// -------------------------------------------------------------------

/**
 * Vérifie si un template payant peut être envoyé.
 * Si oui, incrémente le compteur Redis ET la table TemplateCounter PG.
 * Si non, retourne false sans modifier les compteurs.
 *
 * TOUJOURS appeler cette fonction AVANT d'envoyer le template Meta.
 */
export async function canSendTemplate(
  userId: string,
  type: TemplateType,
  opts?: { dryRun?: boolean },
): Promise<{ allowed: boolean; reason?: string }> {
  if (await isDormant(userId)) {
    return { allowed: false, reason: 'USER_DORMANT' };
  }

  const month = currentMonth();
  let check: { allowed: boolean; reason?: string };
  let redisAvailable = true;

  try {
    check = await checkViaRedis(userId, type, month);
  } catch {
    redisAvailable = false;
    check = await checkViaPg(userId, type, month);
  }

  if (!check.allowed) {
    console.log(
      JSON.stringify({
        event: 'template_blocked',
        userId,
        type,
        month,
        reason: check.reason,
      }),
    );
    return check;
  }

  if (opts?.dryRun) return { allowed: true };

  if (redisAvailable) {
    try {
      await incrementRedis(userId, type, month);
    } catch (err) {
      console.error(
        JSON.stringify({ event: 'redis_increment_failed', userId, type, err: String(err) }),
      );
    }
  }

  try {
    await prisma.$transaction([
      prisma.templateCounter.upsert({
        where: { userId_month_type: { userId, month, type: type as PrismaTemplateType } },
        create: { userId, month, type: type as PrismaTemplateType, count: 1 },
        update: { count: { increment: 1 } },
      }),
    ]);
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'pg_increment_failed', userId, type, err: String(err) }),
    );
  }

  return { allowed: true };
}

// -------------------------------------------------------------------
// Convenience wrapper (backward-compat, used in tests)
// -------------------------------------------------------------------

export async function checkAndIncrementTemplate(
  userId: string,
  type: string,
): Promise<boolean> {
  const result = await canSendTemplate(userId, type as TemplateType);
  return result.allowed;
}

// -------------------------------------------------------------------
// State query
// -------------------------------------------------------------------

export async function getTemplateCounters(
  userId: string,
): Promise<{ total: number; byType: Record<TemplateType, number> }> {
  const month = currentMonth();
  const types = Object.keys(CAPS) as TemplateType[];

  try {
    const keys = [totalKey(userId, month), ...types.map((t) => typeKey(userId, month, t))];
    const values = await redis.mget(...keys);

    const total = parseInt(values[0] ?? '0', 10);
    const byType = Object.fromEntries(
      types.map((t, i) => [t, parseInt(values[i + 1] ?? '0', 10)]),
    ) as Record<TemplateType, number>;

    return { total, byType };
  } catch {
    // Redis unavailable — fall back to PG
    const rows = await prisma.templateCounter.findMany({ where: { userId, month } });

    const byType = Object.fromEntries(types.map((t) => [t, 0])) as Record<TemplateType, number>;
    let total = 0;
    for (const row of rows) {
      const t = row.type as TemplateType;
      if (t in byType) {
        byType[t] = row.count;
        total += row.count;
      }
    }

    return { total, byType };
  }
}
