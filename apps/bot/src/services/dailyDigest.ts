import { PrismaClient, UserPlan } from '@prisma/client';
import { getMatchedOffers } from './matching';
import { recordPullDelivery } from './pull';
import { sendPaidTemplate } from './templateGate';

// Sélection quotidienne automatique PREMIUM/ELITE — voir .claude/CLAUDE.md
// ("Règles métier CRITIQUES", exception DAILY_DIGEST). Contrairement à
// OFFRES/SUITE, n'utilise jamais session:{userId}:offset (pas de pagination
// à préserver, c'est une sélection figée du jour, pas une session interactive).
// Template `daily_digest_fr` approuvé par Meta : corps 100% statique (pas de
// variable), avec un bouton quick-reply "OFFRES" qui redéclenche directement
// le flow OFFRES existant côté router (aucun lien web / token nécessaire).
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

    // Log analytique des offres livrées ce jour-là — indépendant du template
    // envoyé, conservé pour le suivi/matching même si le corps du message ne
    // référence plus cet id (plus de lien web depuis le retrait du bouton URL).
    await recordPullDelivery(user.id, 'DAILY_DIGEST', offers.map((o) => o.id), plan);

    // Corps et bouton "OFFRES" sont statiques côté template Meta — aucun
    // paramètre dynamique à envoyer.
    const result = await sendPaidTemplate(
      user.phone,
      user.id,
      'DAILY_DIGEST',
      TEMPLATE_NAME,
      [],
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
