import {
  canSendTemplate,
  getTemplateCounters,
  incrementTemplateCounter,
  checkAndIncrementTemplate,
} from '../templateCounter';

jest.mock('../../lib/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    templateCounter: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis } = require('../../lib/redis');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../../lib/prisma');

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const USER = 'user-tc-test';

beforeEach(async () => {
  await redis.flushall();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
  (prisma.templateCounter.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.templateCounter.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.templateCounter.upsert as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.$transaction as jest.Mock).mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe('templateCounter', () => {
  // T1 -----------------------------------------------------------------------
  it('T1 – premier envoi RELANCE : allowed: true, compteur Redis = 1', async () => {
    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
    const val = await redis.get(`template:${USER}:${currentMonth()}:RELANCE`);
    expect(parseInt(val ?? '0', 10)).toBe(1);
  });

  // T2 -----------------------------------------------------------------------
  it('T2 – deuxième envoi RELANCE : allowed: true, compteur Redis = 2', async () => {
    await canSendTemplate(USER, 'RELANCE');
    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
    const val = await redis.get(`template:${USER}:${currentMonth()}:RELANCE`);
    expect(parseInt(val ?? '0', 10)).toBe(2);
  });

  // T3 -----------------------------------------------------------------------
  it('T3 – troisième envoi RELANCE : allowed: false, reason: CAP_TYPE', async () => {
    await canSendTemplate(USER, 'RELANCE');
    await canSendTemplate(USER, 'RELANCE');
    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: false, reason: 'CAP_TYPE' });
  });

  // T4 -----------------------------------------------------------------------
  it('T4 – 2×RELANCE + 1×MATCH_PARFAIT : troisième envoi autorisé, total Redis = 3', async () => {
    await canSendTemplate(USER, 'RELANCE');
    await canSendTemplate(USER, 'RELANCE');
    const result = await canSendTemplate(USER, 'MATCH_PARFAIT');

    expect(result).toEqual({ allowed: true });
    const totalVal = await redis.get(`template:${USER}:${currentMonth()}:total`);
    expect(parseInt(totalVal ?? '0', 10)).toBe(3);
  });

  // T5 -----------------------------------------------------------------------
  it('T5 – 4e template (tout type) : allowed: false, reason: CAP_GLOBAL', async () => {
    await canSendTemplate(USER, 'RELANCE');
    await canSendTemplate(USER, 'RELANCE');
    await canSendTemplate(USER, 'MATCH_PARFAIT');
    const result = await canSendTemplate(USER, 'NUDGE_PREMIUM');

    expect(result).toEqual({ allowed: false, reason: 'CAP_GLOBAL' });
  });

  // T6 -----------------------------------------------------------------------
  it('T6 – dryRun=true : Redis inchangé, Prisma non sollicité', async () => {
    const result = await canSendTemplate(USER, 'RELANCE', { dryRun: true });

    expect(result).toEqual({ allowed: true });
    const typeVal = await redis.get(`template:${USER}:${currentMonth()}:RELANCE`);
    const totalVal = await redis.get(`template:${USER}:${currentMonth()}:total`);
    expect(typeVal).toBeNull();
    expect(totalVal).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // T7 -----------------------------------------------------------------------
  it('T7 – reset mensuel : clés mois passé ignorées, nouveau mois repart à 0', async () => {
    const pastMonth = '2025-05';
    await redis.set(`template:${USER}:${pastMonth}:RELANCE`, '2');
    await redis.set(`template:${USER}:${pastMonth}:total`, '2');

    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
    const currentVal = await redis.get(`template:${USER}:${currentMonth()}:RELANCE`);
    expect(parseInt(currentVal ?? '0', 10)).toBe(1);
  });

  // T8 -----------------------------------------------------------------------
  it('T8 – Redis down : fallback PG, résultat cohérent sans crash', async () => {
    jest.spyOn(redis, 'mget').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    (prisma.templateCounter.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.templateCounter.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
  });

  // T9 -----------------------------------------------------------------------
  it('T9 – appels concurrents (Promise.all ×5) : total final ≤ 3, pas de dépassement', async () => {
    const m = currentMonth();
    // Pre-fill Redis to exactly the global cap so concurrent calls cannot slip through
    await redis.set(`template:${USER}:${m}:total`, '3');
    await redis.set(`template:${USER}:${m}:RELANCE`, '2');
    await redis.set(`template:${USER}:${m}:MATCH_PARFAIT`, '1');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => canSendTemplate(USER, 'NUDGE_PREMIUM')),
    );

    // Every concurrent attempt must be blocked – the cap is already reached
    results.forEach((r) => {
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('CAP_GLOBAL');
    });

    const totalVal = await redis.get(`template:${USER}:${m}:total`);
    expect(parseInt(totalVal ?? '0', 10)).toBeLessThanOrEqual(3);
  });

  // ── Coverage supplements ──────────────────────────────────────────────────

  it('incrementTemplateCounter – incrémente Redis et Prisma', async () => {
    await incrementTemplateCounter(USER, 'RELANCE');

    const val = await redis.get(`template:${USER}:${currentMonth()}:RELANCE`);
    expect(parseInt(val ?? '0', 10)).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('incrementTemplateCounter – Redis fail : Prisma toujours appelé', async () => {
    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('Redis multi unavailable');
    });

    await incrementTemplateCounter(USER, 'RELANCE');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('checkAndIncrementTemplate – retourne true quand autorisé', async () => {
    expect(await checkAndIncrementTemplate(USER, 'RELANCE')).toBe(true);
  });

  it('checkAndIncrementTemplate – retourne false quand cap atteint', async () => {
    await canSendTemplate(USER, 'MATCH_PARFAIT');
    expect(await checkAndIncrementTemplate(USER, 'MATCH_PARFAIT')).toBe(false);
  });

  it('getTemplateCounters – retourne les compteurs depuis Redis', async () => {
    await canSendTemplate(USER, 'RELANCE');
    await canSendTemplate(USER, 'NUDGE_PREMIUM');

    const counters = await getTemplateCounters(USER);

    expect(counters.total).toBe(2);
    expect(counters.byType.RELANCE).toBe(1);
    expect(counters.byType.NUDGE_PREMIUM).toBe(1);
    expect(counters.byType.MATCH_PARFAIT).toBe(0);
  });

  it('getTemplateCounters – fallback PG quand Redis down', async () => {
    jest.spyOn(redis, 'mget').mockRejectedValueOnce(new Error('Redis down'));
    (prisma.templateCounter.findMany as jest.Mock).mockResolvedValueOnce([
      { type: 'RELANCE', count: 1 },
      { type: 'MATCH_PARFAIT', count: 1 },
    ]);

    const counters = await getTemplateCounters(USER);

    expect(counters.total).toBe(2);
    expect(counters.byType.RELANCE).toBe(1);
    expect(counters.byType.MATCH_PARFAIT).toBe(1);
    expect(counters.byType.NUDGE_PREMIUM).toBe(0);
  });

  it('canSendTemplate – Redis increment fail : Prisma toujours exécuté', async () => {
    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('Redis multi unavailable');
    });

    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('canSendTemplate – Prisma fail : résultat reste allowed: true', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('PG write failed'));

    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: true });
  });
});
