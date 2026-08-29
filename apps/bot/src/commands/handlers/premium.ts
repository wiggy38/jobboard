import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendInteractiveCtaUrl } from '../../services/whatsapp';
import { generateSubscribeToken, buildSubscribeUrl } from '../../services/tokenService';
import { getSetting } from '../../lib/settings';
import { SETTING_KEYS, planLimitsLine } from '@tumaa/shared';

export async function handlePremium(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  const token = generateSubscribeToken(user.id);
  const [pricing, limits] = await Promise.all([
    getSetting(SETTING_KEYS.PLAN_PRICING),
    getSetting(SETTING_KEYS.PLAN_LIMITS),
  ]);

  await sendInteractiveCtaUrl(
    cmd.userId,
    '💎 *Élargis ta recherche !*\n\n' +
      `📱 *PREMIUM — ${pricing.PREMIUM.price} FCFA/mois*\n` +
      `✓ ${planLimitsLine(limits.PREMIUM)}\n` +
      '✓ Alertes mots-clés\n' +
      '✓ Historique 30 jours\n\n' +
      `👑 *ELITE — ${pricing.ELITE.price} FCFA/mois*\n` +
      '✓ Tout du Premium +\n' +
      '✓ Villes/secteurs/contrats illimités\n' +
      `✓ Jusqu'à ${limits.ELITE.maxCountries} pays de recherche`,
    '👉 Choisir ma formule',
    buildSubscribeUrl(token),
    cmd.country,
  );
}
