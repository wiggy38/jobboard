import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

const RELANCE_THRESHOLD = 2;

function relanceKey(userId: string): string {
  return `dormant:${userId}:relance_count`;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function secondsUntilMonthEnd(): number {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);
}

/**
 * À appeler après chaque envoi de template RELANCE sans réponse.
 * Si relance_count atteint 2 → passe User.status = DORMANT en PG.
 * Clé Redis : dormant:{userId}:relance_count  (TTL fin du mois)
 */
export async function recordRelanceAttempt(userId: string): Promise<{
  relanceCount: number;
  becameDormant: boolean;
}> {
  const key = relanceKey(userId);
  const ttl = secondsUntilMonthEnd();

  let relanceCount = 1;
  try {
    const results = await redis.multi().incr(key).expire(key, ttl).exec();
    relanceCount = (results?.[0]?.[1] as number) ?? 1;
  } catch (err) {
    console.error(JSON.stringify({ event: 'redis_relance_incr_failed', userId, err: String(err) }));
    // Redis unavailable — fall back: read PG status to decide
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status === 'DORMANT') {
      return { relanceCount: RELANCE_THRESHOLD, becameDormant: false };
    }
  }

  if (relanceCount >= RELANCE_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'DORMANT' },
    });
    return { relanceCount, becameDormant: true };
  }

  return { relanceCount, becameDormant: false };
}

/**
 * À appeler dès qu'un utilisateur DORMANT répond au bot.
 * Réactive User.status = ACTIVE et reset le compteur Redis.
 * Réinitialise aussi les clés template:{userId}:{mois}:* du mois courant.
 */
export async function reactivateUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE' },
  });

  try {
    const month = currentMonth();
    await redis.del(
      relanceKey(userId),
      `template:${userId}:${month}:total`,
      `template:${userId}:${month}:RELANCE`,
      `template:${userId}:${month}:MATCH_PARFAIT`,
      `template:${userId}:${month}:NUDGE_PREMIUM`,
    );
  } catch (err) {
    console.error(JSON.stringify({ event: 'redis_reactivate_failed', userId, err: String(err) }));
  }
}

/**
 * Vérifie si un utilisateur est DORMANT (évite une requête PG
 * en checkant d'abord Redis).
 */
export async function isDormant(userId: string): Promise<boolean> {
  try {
    const count = await redis.get(relanceKey(userId));
    if (count !== null) {
      return parseInt(count, 10) >= RELANCE_THRESHOLD;
    }
    // Key absent — Redis is up but counter not set; user is not dormant via Redis
    // Still confirm against PG as source of truth (e.g. status set directly)
  } catch {
    // Redis unavailable — fall through to PG
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  return user?.status === 'DORMANT';
}
