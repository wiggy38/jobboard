import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';

export async function handlePause(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({
    where: { phone: cmd.userId },
    select: { id: true, status: true },
  });

  if (!user) {
    await sendText(cmd.userId, 'Écris *OFFRES* pour commencer.');
    return;
  }

  if (user.status === 'PAUSED') {
    await sendText(
      cmd.userId,
      '⏸️ Tu es déjà en pause.\n\nRéponds *OFFRES* pour reprendre.',
    );
    return;
  }

  await db.user.update({
    where: { id: user.id },
    data: { status: 'PAUSED' },
  });

  await sendText(
    cmd.userId,
    '⏸️ *Notifications mises en pause*\n\n' +
      'Tu ne recevras plus d\'alertes automatiques.\n\n' +
      'Réponds *OFFRES* quand tu veux reprendre.',
  );
}
