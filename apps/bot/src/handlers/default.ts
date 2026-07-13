import { BotContext } from '../types';
import { sendText } from '../services/whatsapp';
import { prisma } from '../lib/prisma';

export async function handleDefault(ctx: BotContext): Promise<void> {
  const pullCount = await prisma.pullEvent.count({
    where: { userId: ctx.userId },
  });

  if (pullCount === 0) {
    await sendText(
      ctx.message.from,
      `👋 Bienvenue sur TUMAA !\n\n` +
        `Je suis ton assistant emploi sur WhatsApp 🇧🇫\n` +
        `Je t'envoie chaque jour les meilleures offres d'emploi au Burkina Faso, directement ici.\n\n` +
        `Pour commencer, écris :\n\n` +
        `OFFRES — Voir les offres disponibles maintenant\n\n` +
        `AIDE — Voir toutes les commandes`,
    );
  } else {
    await sendText(
      ctx.message.from,
      `🤔 Je n'ai pas compris "${ctx.message.body}"\n\n` +
        `Écris OFFRES pour les offres du jour\n\n` +
        `Ou AIDE pour voir toutes les commandes`,
    );
  }
}
