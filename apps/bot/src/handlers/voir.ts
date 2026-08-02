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

  // Les contacts sont toujours visibles, quel que soit le plan. Seule la
  // source scrappée reste réservée aux plans payants (protection de
  // l'attribution, indépendant de la grille tarifaire).
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
  if (ctx.userPlan !== 'FREEMIUM') {
    body += `\n✨ Source : ${offer.source.name}`;
  }

  if (ctx.userPlan === 'FREEMIUM') {
    body +=
      `\n\n💎 Passe à PREMIUM (650 FCFA/mois) pour suivre 3 villes, 3 secteurs, ` +
      `recevoir les alertes mots-clés et voir la source de chaque offre.`;
  }

  await sendText(ctx.message.from, body);
}
