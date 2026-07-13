import { redisClient } from './redis';

const WINDOW_TTL = 86_400;

const key = (userId: string) => `user:${userId}:window`;

export async function openWindow(userId: string): Promise<void> {
  await redisClient.set(key(userId), '1', 'EX', WINDOW_TTL);
}

export async function hasOpenWindow(userId: string): Promise<boolean> {
  const val = await redisClient.get(key(userId));
  return val !== null;
}

export async function refreshWindow(userId: string): Promise<void> {
  await redisClient.expire(key(userId), WINDOW_TTL);
}
