import type { JobOffer, PrismaClient } from '@prisma/client';
import { sendTemplateIfAllowed } from './counter';

function formatDeadline(deadline: Date | null): string {
  if (!deadline) return 'Non précisée';
  return deadline.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export async function sendMatchParfait(
  userId: string,
  phone: string,
  job: JobOffer,
  db: PrismaClient,
): Promise<{ sent: boolean; reason?: string }> {
  const body =
    `🔥 *Offre idéale détectée !*\n\n` +
    `💼 ${job.title} — ${job.contractType}\n` +
    `📍 ${job.city} | 🏢 ${job.organization}\n` +
    `⏳ Clôture : ${formatDeadline(job.deadline)}\n\n` +
    `Cette offre correspond à 100% à votre profil.\n` +
    `Tapez *OFFRES* maintenant pour la consulter.`;

  return sendTemplateIfAllowed(
    userId,
    'MATCH_PARFAIT',
    { type: 'text', text: { body } },
    phone,
    db,
  );
}
