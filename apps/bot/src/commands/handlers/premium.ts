import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendInteractiveCtaUrl } from '../../services/whatsapp';
import { generateSubscribeToken, buildSubscribeUrl } from '../../services/tokenService';

export async function handlePremium(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  const token = generateSubscribeToken(user.id);

  await sendInteractiveCtaUrl(
    cmd.userId,
    '💎 *Débloquez les contacts !*\n\n' +
      '📱 *PREMIUM — 650 FCFA/mois*\n' +
      '✓ Contacts visibles sur toutes les offres\n' +
      '✓ 3 villes + 3 secteurs de recherche\n' +
      '✓ Historique 30 jours\n\n' +
      '👑 *ELITE — 1 250 FCFA/mois*\n' +
      '✓ Tout du Premium +\n' +
      '✓ Villes/secteurs illimités\n' +
      '✓ Jusqu\'à 3 pays\n' +
      '✓ Alertes mots-clés',
    '👉 Choisir ma formule',
    buildSubscribeUrl(token),
  );
}
