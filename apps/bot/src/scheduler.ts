import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { postDailyChannelTeasers } from './services/channelTeaser';

const NAME = 'bot-scheduler';
const db = new PrismaClient();

// BullMQ Worker exige maxRetriesPerRequest: null / enableReadyCheck: false —
// incompatible avec le client ioredis partagé (lib/redis.ts, configuré pour
// les commandes ponctuelles), d'où une connexion dédiée ici, comme pour
// apps/scraper/src/scheduler.ts.
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
};

const queue = new Queue('bot', { connection });

// Promesse faite aux abonnés lors du JOIN (services/channels.ts) : un teaser
// chaque matin à 08:00, un par canal national (#Emploi-BF, #Emploi-BJ...).
const CHANNEL_TEASER_JOB = { name: 'channel-teaser-daily', pattern: '0 8 * * *' };

// Retries automatiques : 3 tentatives, backoff exponentiel (1min, 2min, 4min)
// — même politique que apps/scraper/src/scheduler.ts.
const RETRY_OPTS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } };

async function registerJobs(): Promise<void> {
  await queue.add(
    CHANNEL_TEASER_JOB.name,
    {},
    { repeat: { pattern: CHANNEL_TEASER_JOB.pattern }, ...RETRY_OPTS },
  );
  console.log(`[${NAME}] Registered: ${CHANNEL_TEASER_JOB.name} (${CHANNEL_TEASER_JOB.pattern})`);
}

const worker = new Worker(
  'bot',
  async (job) => {
    const ts = new Date().toISOString();
    console.log(`[${NAME}] [${ts}] Starting job: ${job.name}`);

    if (job.name === CHANNEL_TEASER_JOB.name) {
      const results = await postDailyChannelTeasers(db);
      console.log(`[${NAME}] Channel teasers postés :`, JSON.stringify(results));
      return { results };
    }

    throw new Error(`Job inconnu : ${job.name}`);
  },
  { connection },
);

worker.on('completed', (job) => {
  console.log(`[${NAME}] Job ${job.name} terminé avec succès`);
});

worker.on('failed', (job, err) => {
  console.error(`[${NAME}] Job ${job?.name ?? '?'} échoué : ${err.message}`);
});

registerJobs()
  .then(() => console.log(`[${NAME}] Scheduler démarré — en attente des jobs...`))
  .catch((err) => {
    console.error(`[${NAME}] Échec démarrage scheduler :`, err);
    process.exit(1);
  });
