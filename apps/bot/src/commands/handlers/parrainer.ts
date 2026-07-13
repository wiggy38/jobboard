import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';

export async function handleParrainer(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({
    where: { phone: cmd.userId },
    select: { referralCode: true, referralCredits: true },
  });

  if (!user) {
    await sendText(cmd.userId, 'Écris *OFFRES* pour commencer et obtenir ton code de parrainage.');
    return;
  }

  await sendText(
    cmd.userId,
    '🤝 *Parrainage Tumaa*\n\n' +
      `Ton code : *${user.referralCode}*\n\n` +
      `Jours Premium gagnés : *${user.referralCredits}*\n\n` +
      'Partage ton code. Pour chaque ami inscrit,\n' +
      'vous gagnez tous les deux 7 jours Premium offerts !',
  );
}
