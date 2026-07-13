import { BotContext } from '../types';
import { getUserWithProfile } from '../services/pull';
import { extendWindow } from '../services/window';
import { sendText } from '../services/whatsapp';
import { prisma } from '../lib/prisma';

function formatDeadline(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function handleVoir(ctx: BotContext): Promise<void> {
  const raw = ctx.parsed.args?.[0];
  const n = raw ? parseInt(raw, 10) : NaN;

  if (isNaN(n) || n < 1 || n > 5) {
    await sendText(
      ctx.message.from,
      'Réponds *VOIR 1* à *VOIR 5* pour débloquer une offre.',
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
      organization: true,
      city: true,
      contractType: true,
      description: true,
      contactEmail: true,
      contactPhone: true,
      contactAddress: true,
      applicationUrl: true,
      deadline: true,
      source: { select: { name: true } },
    },
  });

  const offer = offers[n - 1];

  if (!offer) {
    await sendText(
      ctx.message.from,
      "Cette offre n'existe plus. Réponds *OFFRES* pour une nouvelle liste.",
    );
    return;
  }

  if (ctx.userPlan === 'FREEMIUM') {
    await prisma.jobInteraction.upsert({
      where: { userId_jobId_action: { userId: ctx.userId, jobId: offer.id, action: 'SEEN' } },
      create: { userId: ctx.userId, jobId: offer.id, action: 'SEEN' },
      update: {},
    });

    await sendText(
      ctx.message.from,
      `🔒 Offre #${n} — ${offer.title}\n\n` +
        `${offer.organization} — ${offer.city} — ${offer.contractType}\n` +
        `Les contacts de cette offre sont réservés aux membres Premium.\n\n` +
        `✨ Pour 650 FCFA/mois tu débloques :\n\n` +
        `✓ Tous les contacts et sources d'offres\n` +
        `✓ Historique 30 jours\n` +
        `✓ 3 villes + 3 secteurs de recherche\n\n` +
        `Réponds PREMIUM pour t'abonner\n\n` +
        `Ou ESSAI pour 48h gratuits (une seule fois)`,
    );
  } else {
    await prisma.jobInteraction.upsert({
      where: { userId_jobId_action: { userId: ctx.userId, jobId: offer.id, action: 'UNLOCKED' } },
      create: { userId: ctx.userId, jobId: offer.id, action: 'UNLOCKED' },
      update: {},
    });

    await extendWindow(ctx.userId);

    const deadlineStr = offer.deadline ? formatDeadline(offer.deadline) : 'Non précisée';
    const descriptionStr = offer.description ?? 'Voir l\'annonce complète';

    let body =
      `✅ Offre #${n} — ${offer.title}\n\n` +
      `${offer.organization} — ${offer.city} — ${offer.contractType}\n` +
      `📋 Description : ${descriptionStr}\n`;

    if (offer.contactEmail) body += `\n📧 ${offer.contactEmail}`;
    if (offer.contactPhone) body += `\n📞 ${offer.contactPhone}`;
    if (offer.contactAddress) body += `\n📍 ${offer.contactAddress}`;
    if (offer.applicationUrl) body += `\n🔗 ${offer.applicationUrl}`;

    body += `\n\n⏰ Date limite : ${deadlineStr}`;
    body += `\n✨ Source : ${offer.source.name}`;

    await sendText(ctx.message.from, body);
  }
}
