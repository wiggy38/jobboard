import { PrismaClient, UserPlan } from '@prisma/client';
import { getMatchedOffers } from './matching';
import { recordPullDelivery } from './pull';
import { sendPaidTemplate } from './templateGate';
import { generateDigestToken, buildDigestUrlSuffix } from './tokenService';
import { formatDigestAvailability, formatDigestCta } from '../messages/formatter';

// Sélection quotidienne automatique PREMIUM/ELITE — voir .claude/CLAUDE.md
// ("Règles métier CRITIQUES", exception DAILY_DIGEST). Contrairement à
// OFFRES/SUITE, n'utilise jamais session:{userId}:offset (pas de pagination
// à préserver, c'est une sélection figée du jour, pas une session interactive).
const MESSAGE_DELAY_MS = 800;
const TEMPLATE_NAME = 'daily_digest_fr';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DailyDigestResult {
  sent: number;
  skipped: number;
  blocked: number;
}

export async function postDailyDigests(db: PrismaClient): Promise<DailyDigestResult> {
  const users = await db.user.findMany({
    where: { plan: { in: ['PREMIUM', 'ELITE'] }, status: 'ACTIVE' },
    select: {
      id: true,
      phone: true,
      plan: true,
      countries: true,
      profile: {
        select: { cities: true, sectors: true, levels: true, contractTypes: true, keywords: true },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let blocked = 0;

  for (const user of users) {
    const plan = user.plan as UserPlan;
    const offers = await getMatchedOffers(db, user.id, plan, user.profile, user.countries);

    if (offers.length === 0) {
      skipped++;
      continue;
    }

    // Enregistré AVANT l'envoi : le lien /digest/[pullDeliveryId] envoyé dans le
    // template a besoin de l'id généré ici. Le détail complet des offres du jour
    // vit sur cette page web, jamais dans le corps du message WhatsApp (catégorie
    // Meta UTILITY — voir .claude/CLAUDE.md).
    const delivery = await recordPullDelivery(user.id, 'DAILY_DIGEST', offers.map((o) => o.id), plan);
    const urlSuffix = buildDigestUrlSuffix(delivery.id, generateDigestToken(delivery.id, user.id));

    // Le lien est un bouton URL du template (pas un texte dans le corps) — le
    // domaine est fixé côté config du bouton dans Meta Business Manager, seul
    // le suffixe dynamique (pullDeliveryId + token) est envoyé ici.
    const result = await sendPaidTemplate(
      user.phone,
      user.id,
      'DAILY_DIGEST',
      TEMPLATE_NAME,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: formatDigestAvailability(offers.length) },
            { type: 'text', text: formatDigestCta() },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: urlSuffix }],
        },
      ],
      user.countries[0],
    );

    if (result.sent) {
      sent++;
    } else {
      blocked++;
    }

    await delay(MESSAGE_DELAY_MS);
  }

  return { sent, skipped, blocked };
}
