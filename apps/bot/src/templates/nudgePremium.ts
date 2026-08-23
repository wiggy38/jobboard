import type { PrismaClient } from '@prisma/client';
import { sendTemplateIfAllowed } from './counter';
import { generateSubscribeToken, buildSubscribeUrl } from '../services/tokenService';
import { getSetting } from '../lib/settings';
import { SETTING_KEYS } from '@tumaa/shared';

export async function sendNudgePremium(
  userId: string,
  phone: string,
  db: PrismaClient,
  country?: string,
): Promise<{ sent: boolean; reason?: string }> {
  const token = generateSubscribeToken(userId);
  const pricing = await getSetting(SETTING_KEYS.PLAN_PRICING);

  return sendTemplateIfAllowed(
    userId,
    'NUDGE_PREMIUM',
    {
      type: 'text',
      text: {
        body:
          '🔥 *Vous êtes actif sur Tumaa !*\n' +
          'Passez PREMIUM pour suivre 3 villes + 3 secteurs + 3 types de contrat ' +
          'et recevoir des alertes mots-clés.\n\n' +
          `💎 ${pricing.PREMIUM.price} FCFA/mois — ` +
          buildSubscribeUrl(token),
      },
    },
    phone,
    db,
    country,
  );
}
