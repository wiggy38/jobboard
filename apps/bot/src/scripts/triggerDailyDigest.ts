import 'dotenv/config';
import { Queue } from 'bullmq';

// Enfile un run immédiat du job "daily-digest" sur la queue BullMQ 'bot', sans attendre
// le cron 07h30 (scheduler.ts). À utiliser avec un worker déjà démarré via `pnpm scheduler`
// et, pour un test contre la prod, avec DAILY_DIGEST_TEST_PHONES positionné (voir plan de
// test) — sinon ce trigger déclenche un run complet sur tous les PREMIUM/ELITE actifs.
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
};

async function main(): Promise<void> {
  const queue = new Queue('bot', { connection });
  const job = await queue.add('daily-digest', {});
  console.log(`[trigger-daily-digest] Job enfilé : ${job.id}`);
  await queue.close();
}

main().catch((err) => {
  console.error('[trigger-daily-digest] Échec :', err);
  process.exit(1);
});
