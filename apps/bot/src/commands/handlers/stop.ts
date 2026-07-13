import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';
import { redis } from '../../lib/redis';

export async function handleStop(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({
    where: { phone: cmd.userId },
    select: { id: true, status: true },
  });

  if (!user) {
    await sendText(cmd.userId, 'Aucun compte trouvé pour ce numéro.');
    return;
  }

  if (user.status === 'STOPPED') {
    await sendText(
      cmd.userId,
      'Tu es déjà désinscrit. Réponds *REPRENDRE* pour revenir.',
    );
    return;
  }

  await db.user.update({
    where: { id: user.id },
    data: { status: 'STOPPED' },
  });

  await redis.del(`user:${cmd.userId}:window`);

  await sendText(
    cmd.userId,
    '👋 *Tu es désinscrit de Tumaa*\n\n' +
      'Tu ne recevras plus d\'offres.\n\n' +
      'Tes données sont conservées.\n' +
      'Reviens quand tu veux en écrivant *REPRENDRE*.',
  );
}
