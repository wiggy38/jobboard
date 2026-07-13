import 'dotenv/config';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { parseIncoming } from './whatsapp/parser';
import { routeCommand } from './commands/router';
import { handleUnknown } from './commands/handlers/unknown';
import { openWindow } from './session/window';
import { offerRoutes } from './routes/offers';
import { adminRoutes } from './routes/admin';

const db = new PrismaClient();

const fastify = Fastify({
  logger: false,
  ajv: { customOptions: { strict: false } },
});

fastify.register(offerRoutes);
fastify.register(adminRoutes);

fastify.get('/webhook/whatsapp', async (req, reply) => {
  const query = req.query as Record<string, string>;
  const mode      = query['hub.mode'];
  const token     = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return reply.status(200).send(challenge);
  }
  return reply.status(403).send('Forbidden');
});

fastify.post('/webhook/whatsapp', async (req, reply) => {
  reply.status(200).send('OK');

  const body = req.body as unknown;
  const parsed = parseIncoming(body);
  if (!parsed) return;

  setImmediate(async () => {
    try {
      await openWindow(parsed.userId);
      await routeCommand(parsed, db);
    } catch (err) {
      console.error('[Tumaa Bot] Erreur non gérée:', err);
      try {
        await handleUnknown(parsed, db);
      } catch (innerErr) {
        console.error('[Tumaa Bot] Impossible d\'envoyer handleUnknown:', innerErr);
      }
    }
  });
});

const start = async () => {
  await fastify.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  console.log(`[Tumaa Bot] Serveur démarré sur le port ${process.env.PORT || 3000}`);
  console.log(`[Tumaa Bot] Mode: ${process.env.NODE_ENV || 'development'}`);
};
start().catch(console.error);
