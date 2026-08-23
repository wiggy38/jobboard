import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendInteractiveCtaUrl } from '../../services/whatsapp';
import { generateSubscribeToken, buildSubscribeUrl } from '../../services/tokenService';
import { getSetting } from '../../lib/settings';
import { SETTING_KEYS } from '@tumaa/shared';

export async function handlePremium(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  const token = generateSubscribeToken(user.id);
  const pricing = await getSetting(SETTING_KEYS.PLAN_PRICING);

  await sendInteractiveCtaUrl(
    cmd.userId,
    '💎 *Élargis ta recherche !*\n\n' +
      `📱 *PREMIUM — ${pricing.PREMIUM.price} FCFA/mois*\n` +
      '✓ 3 villes + 3 secteurs + 3 types de contrat\n' +
      '✓ Alertes mots-clés\n' +
      '✓ Historique 30 jours\n\n' +
      `👑 *ELITE — ${pricing.ELITE.price} FCFA/mois*\n` +
      '✓ Tout du Premium +\n' +
      '✓ Villes/secteurs/contrats illimités\n' +
      '✓ Jusqu\'à 3 pays de recherche',
    '👉 Choisir ma formule',
    buildSubscribeUrl(token),
    cmd.country,
  );
}
