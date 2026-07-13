import { BotContext } from '../types';
import { sendText } from '../services/whatsapp';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export async function handleStop(ctx: BotContext): Promise<void> {
  if (ctx.userStatus === 'STOPPED') {
    await sendText(
      ctx.message.from,
      'Tu es déjà désinscrit. Réponds *REPRENDRE* pour revenir.',
    );
    return;
  }

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { status: 'STOPPED' },
  });

  await redis.del(`user:${ctx.userId}:window`);

  await sendText(
    ctx.message.from,
    '👋 Tu es désinscrit de Tumaa\n' +
      'Tu ne recevras plus d\'offres.\n\n' +
      'Tes données sont conservées.\n' +
      'Reviens quand tu veux en écrivant REPRENDRE',
  );
}
