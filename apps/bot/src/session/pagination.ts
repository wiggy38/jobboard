import { SETTING_KEYS } from '@tumaa/shared';
import { redisClient } from './redis';
import { getSetting } from '../lib/settings';

export async function getPullBatchSize(): Promise<number> {
  return getSetting(SETTING_KEYS.PULL_BATCH_SIZE);
}

const OFFSET_TTL = 86_400;

const key = (userId: string) => `session:${userId}:offset`;

export async function getOffset(userId: string): Promise<number> {
  const val = await redisClient.get(key(userId));
  return val !== null ? parseInt(val, 10) : 0;
}

export async function setOffset(userId: string, offset: number): Promise<void> {
  await redisClient.set(key(userId), offset.toString(), 'EX', OFFSET_TTL);
}

export async function resetOffset(userId: string): Promise<void> {
  await redisClient.del(key(userId));
}
