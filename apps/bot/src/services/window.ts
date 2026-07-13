import { redis } from '../lib/redis';

const WINDOW_TTL = 86_400;

const key = (userId: string) => `user:${userId}:window`;

export async function openWindow(userId: string): Promise<void> {
  await redis.set(key(userId), '1', 'EX', WINDOW_TTL);
}

export async function isWindowOpen(userId: string): Promise<boolean> {
  const val = await redis.get(key(userId));
  return val === '1';
}

export async function extendWindow(userId: string): Promise<void> {
  await redis.expire(key(userId), WINDOW_TTL);
}
