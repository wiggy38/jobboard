import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';

export async function handleEssai(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({
    where: { phone: cmd.userId },
    select: { id: true, trialUsed: true, plan: true },
  });

  if (!user) {
    await sendText(cmd.userId, 'Écris *OFFRES* pour commencer.');
    return;
  }

  if (user.trialUsed) {
    await sendText(
      cmd.userId,
      '⚠️ Tu as déjà utilisé ton essai gratuit.\n\n' +
        'Réponds *PREMIUM* pour t\'abonner et garder l\'accès complet.',
    );
    return;
  }

  if (user.plan !== 'FREEMIUM') {
    await sendText(cmd.userId, '✅ Tu es déjà abonné Premium. Profite bien de Tumaa !');
    return;
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 2);

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: 'PREMIUM',
      trialUsed: true,
      planStartAt: new Date(),
      planEndAt: trialEnd,
    },
  });

  await sendText(
    cmd.userId,
    '🎉 *48h Premium activés !*\n\n' +
      'Tu as maintenant accès à tous les contacts et détails des offres.\n\n' +
      'Réponds *OFFRES* pour en profiter maintenant.\n\n' +
      `Ton essai expire le ${trialEnd.toLocaleDateString('fr-FR')}.`,
  );
}
