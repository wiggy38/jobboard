import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText, sendInteractiveCtaUrl } from '../../services/whatsapp';
import { openWindow } from '../../session/window';
import { resetOffset } from '../../session/pagination';
import { generateSubscribeToken, buildSubscribeUrl } from '../../services/tokenService';
import { getCountryFromPhone } from '../../lib/country';
import { planLimitsForCreate } from '../../lib/planLimits';
import { getSetting } from '../../lib/settings';
import { SETTING_KEYS } from '@tumaa/shared';

// ── Nouveau numéro — bienvenue, création du compte FREEMIUM, CTA /subscribe ───
// L'onboarding (choix ville/secteur/contrat) ne se fait plus sur WhatsApp : il
// est délégué à la page web /subscribe (formulaire "Continuer gratuitement"
// pour FREEMIUM, ou paiement PREMIUM/ELITE).

export async function startOnboarding(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  await sendText(
    cmd.userId,
    '👋 Bienvenue sur *Tumaa* !\n' +
      'Je vous envoie les meilleures offres d\'emploi directement sur WhatsApp.\n\n' +
      'Pour commencer, choisissez votre formule 👇',
    cmd.country,
  );

  const country = getCountryFromPhone(cmd.userId);
  const freemiumLimits = await planLimitsForCreate('FREEMIUM');

  // Forward-only : le code de parrainage (suffixe "REF-XXXX" détecté par le
  // parser, voir apps/bot/src/whatsapp/parser.ts) ne s'applique qu'à la
  // création — pas de récompense pour l'instant, référentiel seulement.
  let referredById: string | undefined;
  if (cmd.referralCode) {
    const referrer = await db.user.findUnique({ where: { referralCode: cmd.referralCode }, select: { id: true } });
    if (referrer) referredById = referrer.id;
  }

  const user = await db.user.upsert({
    where: { phone: cmd.userId },
    create: {
      phone: cmd.userId,
      plan: 'FREEMIUM',
      status: 'ACTIVE',
      countries: [country],
      ...(referredById ? { referredById } : {}),
      profile: {
        create: {
          cities: [],
          sectors: [],
          levels: [],
          contractTypes: [],
          keywords: [],
          ...freemiumLimits,
        },
      },
    },
    update: {},
  });

  await openWindow(cmd.userId);
  await resetOffset(cmd.userId);

  await sendPlanOptions(cmd, user.id);
}

// ── Rappel formules — renvoyé tant que le profil n'a pas été configuré via le
// wizard web /subscribe (Profile.cities/sectors vides). Appelé aussi bien à
// l'onboarding initial que par le router pour tout message ultérieur d'un
// user qui n'a pas encore choisi sa formule.
export async function sendPlanOptions(cmd: ParsedCommand, userId: string): Promise<void> {
  const token = generateSubscribeToken(userId);
  const pricing = await getSetting(SETTING_KEYS.PLAN_PRICING);

  await sendInteractiveCtaUrl(
    cmd.userId,
    '🆓 *FREEMIUM* — gratuit, 3 villes + 3 secteurs + 3 types de contrat\n' +
      `📱 *PREMIUM — ${pricing.PREMIUM.price} FCFA/mois* — 3 villes + 3 secteurs + 3 types de contrat, alertes mots-clés\n` +
      `👑 *ELITE — ${pricing.ELITE.price} FCFA/mois* — illimité + jusqu'à 3 pays de recherche`,
    '👉 Choisir ma formule',
    buildSubscribeUrl(token),
    cmd.country,
  );
}
