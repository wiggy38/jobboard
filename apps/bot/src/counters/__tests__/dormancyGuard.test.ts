import {
  isDormant,
  reactivateUser,
  recordRelanceAttempt,
} from '../dormancyGuard';
import { canSendTemplate } from '../templateCounter';

jest.mock('../../lib/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      update: jest.fn().mockResolvedValue({}),
    },
    templateCounter: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  },
}));

const { redis } = require('../../lib/redis');
const { prisma } = require('../../lib/prisma');

beforeEach(async () => {
  await redis.flushall();
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
  (prisma.user.update as jest.Mock).mockResolvedValue({});
  (prisma.templateCounter.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.templateCounter.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.templateCounter.upsert as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.$transaction as jest.Mock).mockImplementation((ops: unknown[]) => Promise.all(ops));
});

const USER = 'dormancy-test-user';

describe('dormancyGuard', () => {
  it('user is not dormant with 0 relances', async () => {
    expect(await isDormant(USER)).toBe(false);
  });

  it('returns relanceCount=1 and becameDormant=false after first relance', async () => {
    const result = await recordRelanceAttempt(USER);
    expect(result.relanceCount).toBe(1);
    expect(result.becameDormant).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('user becomes DORMANT after 2 relances', async () => {
    await recordRelanceAttempt(USER);
    const result = await recordRelanceAttempt(USER);
    expect(result.relanceCount).toBe(2);
    expect(result.becameDormant).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER },
      data: { status: 'DORMANT' },
    });
  });

  it('isDormant returns true when Redis count >= 2', async () => {
    await recordRelanceAttempt(USER);
    await recordRelanceAttempt(USER);
    // Redis counter is at 2, isDormant should return true without hitting PG
    expect(await isDormant(USER)).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('isDormant falls back to PG when Redis key is absent', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ status: 'DORMANT' });
    expect(await isDormant(USER)).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER },
      select: { status: true },
    });
  });

  it('reactivateUser sets status ACTIVE and clears Redis keys', async () => {
    await recordRelanceAttempt(USER);
    await recordRelanceAttempt(USER);
    await reactivateUser(USER);
    expect(prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: USER },
      data: { status: 'ACTIVE' },
    });
    // Redis counter should be cleared — isDormant via Redis returns false
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ status: 'ACTIVE' });
    expect(await isDormant(USER)).toBe(false);
  });

  it('different users are tracked independently', async () => {
    await recordRelanceAttempt('user-A');
    await recordRelanceAttempt('user-A');
    expect(await isDormant('user-B')).toBe(false);
  });

  it('canSendTemplate refuses on DORMANT user without incrementing counters', async () => {
    // Make user DORMANT (2 relances)
    await recordRelanceAttempt(USER);
    await recordRelanceAttempt(USER);

    const result = await canSendTemplate(USER, 'RELANCE');

    expect(result).toEqual({ allowed: false, reason: 'USER_DORMANT' });

    // Verify no template counters were incremented
    const month = new Date().toISOString().slice(0, 7);
    expect(await redis.get(`template:${USER}:${month}:RELANCE`)).toBeNull();
    expect(await redis.get(`template:${USER}:${month}:total`)).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
