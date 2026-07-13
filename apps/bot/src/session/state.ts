import { redisClient } from './redis';

const STATE_TTL = 1_800;

const key = (userId: string) => `session:${userId}:state`;

export interface SessionState {
  step: string;
  data: Record<string, unknown>;
}

export async function getState(userId: string): Promise<SessionState | null> {
  const val = await redisClient.get(key(userId));
  if (val === null) return null;
  return JSON.parse(val) as SessionState;
}

export async function setState(userId: string, state: SessionState): Promise<void> {
  await redisClient.set(key(userId), JSON.stringify(state), 'EX', STATE_TTL);
}

export async function clearState(userId: string): Promise<void> {
  await redisClient.del(key(userId));
}
