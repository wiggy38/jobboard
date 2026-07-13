import { BotContext } from '../types';
import { getUserWithProfile, recordPullEvent } from '../services/pull';
import { openWindow } from '../services/window';
import { sendText } from '../services/whatsapp';
import { prisma } from '../lib/prisma';

function formatDeadline(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function handleOffres(ctx: BotContext): Promise<void> {
  if (ctx.userStatus === 'STOPPED') {
    await sendText(
      ctx.message.from,
      "Tu t'es désabonné de Tumaa. Réponds *REPRENDRE* pour te réinscrire.",
    );
    return;
  }

  const user = await getUserWithProfile(ctx.message.from);
  const profile = user?.profile;

  const hasCities = (profile?.cities?.length ?? 0) > 0;
  const hasSectors = (profile?.sectors?.length ?? 0) > 0;

  const offers = await prisma.jobOffer.findMany({
    where: {
      status: 'ACTIVE',
      ...(hasCities && { city: { in: profile!.cities } }),
      ...(hasSectors && { sector: { in: profile!.sectors } }),
    },
    orderBy: { publishedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      city: true,
      contractType: true,
      contactEmail: true,
      contactPhone: true,
      deadline: true,
    },
  });

  recordPullEvent(ctx.userId).catch((err) =>
    console.warn('[offres] recordPullEvent:', err),
  );

  await openWindow(ctx.userId);

  if (offers.length === 0) {
    const villes = hasCities ? profile!.cities.join(', ') : 'toutes villes';
    const secteurs = hasSectors ? profile!.sectors.join(', ') : 'tous secteurs';
    await sendText(
      ctx.message.from,
      `😔 Aucune offre disponible aujourd'hui\n` +
        `Ton profil est configuré pour : ${villes} — ${secteurs}\n` +
        `Réponds MODIFIER pour élargir tes critères\n\n` +
        `On te préviendra dès que de nouvelles offres arrivent !`,
    );
    return;
  }

  const isPremium = ctx.userPlan !== 'FREEMIUM';

  if (!isPremium) {
    const lines = offers
      .map((o, i) => `${i + 1}. ${o.title} — ${o.city} — ${o.contractType}`)
      .join('\n');
    await sendText(
      ctx.message.from,
      `🔍 TUMAA — ${offers.length} offres disponibles pour toi\n` +
        `${lines}\n` +
        `🔒 Contacts masqués\n\n` +
        `Réponds VOIR 1 pour débloquer les détails\n\n` +
        `Ou PREMIUM pour tout recevoir sans limite`,
    );
  } else {
    const blocks = offers
      .map((o, i) => {
        let block = `${i + 1}. ${o.title} — ${o.city} — ${o.contractType}`;
        if (o.contactEmail) block += `\n📧 ${o.contactEmail}`;
        if (o.contactPhone) block += `\n📞 ${o.contactPhone}`;
        if (o.deadline) block += `\n⏰ Date limite : ${formatDeadline(o.deadline)}`;
        return block;
      })
      .join('\n\n');
    await sendText(
      ctx.message.from,
      `✅ TUMAA — ${offers.length} offres du jour\n\n` +
        `${blocks}\n\n` +
        `Réponds REVOIR pour rappeler une offre manquée`,
    );
  }
}
