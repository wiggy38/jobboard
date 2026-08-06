import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText, sendInteractiveCtaUrl } from '../../services/whatsapp';
import { openWindow } from '../../session/window';
import { resetOffset } from '../../session/pagination';
import { generateSubscribeToken, buildSubscribeUrl } from '../../services/tokenService';
import { getCountryFromPhone } from '../../lib/country';
import { planLimitsForCreate } from '../../lib/planLimits';

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

  const user = await db.user.upsert({
    where: { phone: cmd.userId },
    create: {
      phone: cmd.userId,
      plan: 'FREEMIUM',
      status: 'ACTIVE',
      countries: [country],
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

  const token = generateSubscribeToken(user.id);

  await sendInteractiveCtaUrl(
    cmd.userId,
    '🆓 *FREEMIUM* — gratuit, 1 ville + 1 secteur + 1 type de contrat\n' +
      '📱 *PREMIUM — 650 FCFA/mois* — 3 villes + 3 secteurs + 3 types de contrat, alertes mots-clés\n' +
      '👑 *ELITE — 1 250 FCFA/mois* — illimité + jusqu\'à 3 pays de recherche',
    '👉 Choisir ma formule',
    buildSubscribeUrl(token),
    cmd.country,
  );
}
