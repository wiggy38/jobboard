import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

// ─── Key helpers ────────────────────────────────────────────────────────────

const dailyKey = (date: string) => `pull:daily:${date}`;
const userDailyKey = (userId: string, date: string) => `pull:${userId}:${date}`;

function toDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function today(): string {
  return toDateString();
}

// ─── Redis-only helpers (used by existing tests) ─────────────────────────────

export async function trackPull(userId: string): Promise<boolean> {
  const date = today();
  const uKey = userDailyKey(userId, date);
  const dKey = dailyKey(date);

  const isNew = await redis.set(uKey, '1', 'EX', 172_800, 'NX');

  if (isNew === 'OK') {
    await redis.incr(dKey);
    await redis.expire(dKey, 172_800);
  }

  return isNew === 'OK';
}

export async function getDailyPullCount(date?: string): Promise<number> {
  const d = date ?? today();
  const val = await redis.get(dailyKey(d));
  return parseInt(val ?? '0', 10);
}

export async function getTPQ(totalActiveUsers: number, date?: string): Promise<number> {
  if (totalActiveUsers === 0) return 0;
  const pulls = await getDailyPullCount(date);
  return pulls / totalActiveUsers;
}

// ─── Prisma-backed functions ─────────────────────────────────────────────────

/**
 * Enregistre un événement pull pour l'utilisateur.
 * Idempotent : un seul enregistrement par [userId, date].
 * Redis : SET pull:{userId}:{YYYY-MM-DD} 1 EX 172800 NX
 * PostgreSQL : INSERT ... ON CONFLICT DO NOTHING
 */
export async function recordPullEvent(userId: string): Promise<void> {
  const date = today();
  const key = userDailyKey(userId, date);

  let isNew = false;
  try {
    const result = await redis.set(key, '1', 'EX', 172_800, 'NX');
    isNew = result === 'OK';
  } catch {
    // Redis down — fall through to PG unconditionally (upsert handles dedup)
    isNew = true;
  }

  if (!isNew) return;

  // PrismaClient has no native ON CONFLICT DO NOTHING, use upsert with noop update
  await prisma.pullEvent.upsert({
    where: { userId_date: { userId, date: new Date(date) } },
    create: { userId, date: new Date(date) },
    update: {},
  });
}

/**
 * Calcule le TPQ pour une date donnée (défaut : aujourd'hui).
 * TPQ = users_ayant_pullé_ce_jour / total_users_ACTIVE
 * Retourne un nombre entre 0 et 1.
 */
export async function getDailyPullRate(date?: Date): Promise<number> {
  const target = new Date(toDateString(date)); // strip time component

  const [pulledCount, activeCount] = await Promise.all([
    prisma.pullEvent.count({
      where: { date: target },
    }),
    prisma.user.count({
      where: { status: 'ACTIVE' },
    }),
  ]);

  if (activeCount === 0) return 0;
  return pulledCount / activeCount;
}

/**
 * Retourne le nombre de pulls d'un utilisateur sur les N derniers jours.
 * Utilisé pour identifier les profils engagés (candidats NUDGE_PREMIUM).
 */
export async function getUserPullCount(userId: string, days: number): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  return prisma.pullEvent.count({
    where: {
      userId,
      date: { gte: since },
    },
  });
}
