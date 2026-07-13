import { recordPullEvent, getDailyPullRate, getUserPullCount } from '../pullTracker';

jest.mock('../../lib/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

jest.mock('../../lib/prisma', () => ({
  prisma: {
    pullEvent: {
      upsert: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis } = require('../../lib/redis');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../../lib/prisma');

function todayKey(userId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `pull:${userId}:${date}`;
}

beforeEach(async () => {
  await redis.flushall();
  jest.clearAllMocks();
  (prisma.pullEvent.upsert as jest.Mock).mockResolvedValue({});
  (prisma.pullEvent.count as jest.Mock).mockResolvedValue(0);
  (prisma.user.count as jest.Mock).mockResolvedValue(0);
});

describe('recordPullEvent', () => {
  // T1 ─────────────────────────────────────────────────────────────────────────
  it('T1 – premier appel : Redis NX=1, PG INSERT réussi', async () => {
    await recordPullEvent('user-A');

    const val = await redis.get(todayKey('user-A'));
    expect(val).toBe('1');
    expect(prisma.pullEvent.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.pullEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId_date: expect.objectContaining({ userId: 'user-A' }) }),
      }),
    );
  });

  // T2 ─────────────────────────────────────────────────────────────────────────
  it('T2 – 2e appel même user même jour : Redis NX=0, PG ON CONFLICT ignoré (upsert non rappelé)', async () => {
    await recordPullEvent('user-A');
    await recordPullEvent('user-A');

    // clé Redis toujours à '1'
    const val = await redis.get(todayKey('user-A'));
    expect(val).toBe('1');
    // PG upsert appelé une seule fois (le 2e appel retourne en early return)
    expect(prisma.pullEvent.upsert).toHaveBeenCalledTimes(1);
  });

  // T3 ─────────────────────────────────────────────────────────────────────────
  it('T3 – 2 users différents même jour : 2 clés Redis, 2 upserts PG', async () => {
    await recordPullEvent('user-A');
    await recordPullEvent('user-B');

    const valA = await redis.get(todayKey('user-A'));
    const valB = await redis.get(todayKey('user-B'));
    expect(valA).toBe('1');
    expect(valB).toBe('1');
    expect(prisma.pullEvent.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('getDailyPullRate', () => {
  // T4 ─────────────────────────────────────────────────────────────────────────
  it('T4 – 3 users actifs, 2 ont pullé → retourne 0.666…', async () => {
    (prisma.pullEvent.count as jest.Mock).mockResolvedValue(2);
    (prisma.user.count as jest.Mock).mockResolvedValue(3);

    const rate = await getDailyPullRate();

    expect(rate).toBeCloseTo(2 / 3);
  });

  // T5 ─────────────────────────────────────────────────────────────────────────
  it('T5 – aucun pull (activeCount=0) → retourne 0, pas NaN', async () => {
    (prisma.pullEvent.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);

    const rate = await getDailyPullRate();

    expect(rate).toBe(0);
    expect(Number.isNaN(rate)).toBe(false);
  });
});

describe('getUserPullCount', () => {
  // T6 ─────────────────────────────────────────────────────────────────────────
  it('T6 – fenêtre glissante 7 jours : COUNT correct selon fixtures', async () => {
    (prisma.pullEvent.count as jest.Mock).mockResolvedValue(5);

    const count = await getUserPullCount('user-A', 7);

    expect(count).toBe(5);
    expect(prisma.pullEvent.count).toHaveBeenCalledTimes(1);
    const callArg = (prisma.pullEvent.count as jest.Mock).mock.calls[0][0];
    expect(callArg.where.userId).toBe('user-A');
    expect(callArg.where.date.gte).toBeInstanceOf(Date);
  });
});

describe('recordPullEvent – Redis down fallback', () => {
  it('Redis down : upsert PG quand même (isNew forcé à true)', async () => {
    jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await recordPullEvent('user-C');

    expect(prisma.pullEvent.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('trackPull / getDailyPullCount / getTPQ (Redis-only helpers)', () => {
  const { trackPull, getDailyPullCount, getTPQ } = require('../pullTracker');

  it('trackPull – premier appel retourne true, second retourne false', async () => {
    const first = await trackPull('user-X');
    const second = await trackPull('user-X');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('getDailyPullCount – retourne le nombre de pulls du jour', async () => {
    await trackPull('user-Y');
    await trackPull('user-Z');

    const count = await getDailyPullCount();

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('getTPQ – retourne 0 quand totalActiveUsers = 0', async () => {
    expect(await getTPQ(0)).toBe(0);
  });

  it('getTPQ – retourne pulls / totalActiveUsers', async () => {
    await trackPull('user-P');

    const tpq = await getTPQ(10);

    expect(tpq).toBeGreaterThan(0);
    expect(tpq).toBeLessThanOrEqual(1);
  });
});
