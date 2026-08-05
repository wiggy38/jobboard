import { JobOffer, PrismaClient } from '@prisma/client';
import { NATIONAL_CHANNELS, getChannelId } from '../lib/country';
import { postToChannel } from './whatsapp';
import { buildOfferUrl, generateOfferToken } from './tokenService';

// Auto-post 08:00 sur les canaux WhatsApp nationaux (#Emploi-BF, #Emploi-BJ...)
// — promesse faite aux abonnés lors du JOIN (voir services/channels.ts).
// Gratuit, zéro modération manuelle, toujours un lien wa.me par offre (règle
// canaux nationaux — voir .claude/CLAUDE.md).
const OFFERS_PER_CHANNEL = 5;

// Pas d'utilisateur réel derrière un post de canal (broadcast, pas 1:1) — un
// userId synthétique suffit, le token ne sert qu'à générer une URL d'offre
// valide (accessLevel est toujours FULL, indépendant du plan).
const CHANNEL_TOKEN_USER = 'channel-broadcast';

function formatOfferLine(job: JobOffer): string {
  const token = generateOfferToken(job.id, CHANNEL_TOKEN_USER);
  const url = buildOfferUrl(job.id, token);
  return `💼 *${job.title}*\n📍 ${job.city} | 🏢 ${job.organization}\n👉 ${url}`;
}

export async function buildChannelTeaser(db: PrismaClient, country: string): Promise<string | null> {
  const offers = await db.jobOffer.findMany({
    where: { status: 'ACTIVE', country },
    orderBy: [{ isFeatured: 'desc' }, { isSponsored: 'desc' }, { publishedAt: 'desc' }],
    take: OFFERS_PER_CHANNEL,
  });
  if (offers.length === 0) return null;

  const lines = offers.map(formatOfferLine).join('\n\n');
  return (
    `🌅 *Nouvelles offres d'emploi du jour*\n\n${lines}\n\n` +
    `Pour des offres personnalisées selon votre profil, écrivez OFFRES au bot en message privé.`
  );
}

export interface ChannelTeaserResult {
  country: string;
  posted: boolean;
  reason?: string;
}

export async function postDailyChannelTeasers(db: PrismaClient): Promise<ChannelTeaserResult[]> {
  const results: ChannelTeaserResult[] = [];

  for (const country of Object.keys(NATIONAL_CHANNELS)) {
    const channelId = getChannelId(country);
    if (!channelId) {
      results.push({ country, posted: false, reason: 'CHANNEL_ID non configuré' });
      continue;
    }

    const teaser = await buildChannelTeaser(db, country);
    if (!teaser) {
      results.push({ country, posted: false, reason: 'Aucune offre active' });
      continue;
    }

    await postToChannel(channelId, teaser);
    results.push({ country, posted: true });
  }

  return results;
}
