import { PrismaClient } from '@prisma/client';
import { NATIONAL_CHANNELS, getChannelInviteLink } from '../lib/country';
import { sendInteractiveCtaUrl, sendText } from './whatsapp';

// Enregistre l'intention de rejoindre le canal national du pays (Idempotent —
// un seul ChannelJoin par (userId, country)) puis envoie le lien d'invitation
// WhatsApp Channel réel (wa.me/channel/<code>).
//
// Meta ne fournit aucune API pour abonner un utilisateur à un Channel côté
// serveur (pas de POST /{channelId}/subscribers) — le join effectif ne peut se
// faire que par le clic de l'utilisateur sur ce lien dans son app WhatsApp.
// Voir docs/subscription_flow_elite.md (§ Meta API — auto-join canaux).
export async function joinNationalChannel(
  db: PrismaClient,
  userId: string,
  phone: string,
  country: string,
): Promise<void> {
  const channel = NATIONAL_CHANNELS[country] ?? NATIONAL_CHANNELS.BF;
  const inviteLink = getChannelInviteLink(country) ?? getChannelInviteLink('BF');

  await db.channelJoin.upsert({
    where: { userId_country: { userId, country } },
    update: {},
    create: { userId, country },
  });

  if (!inviteLink) {
    console.error(`[Channels] Aucun lien d'invitation configuré pour ${channel} (CHANNEL_INVITE_LINK_${country})`);
    await sendText(phone, `⚠️ Le canal ${channel} n'est pas encore disponible. Réessaie plus tard.`);
    return;
  }

  try {
    await sendInteractiveCtaUrl(
      phone,
      `👉 Clique pour rejoindre ${channel} et recevoir un teaser des offres chaque matin à 08:00.`,
      `Rejoindre ${channel}`,
      inviteLink,
    );
  } catch (err) {
    console.error(`[Channels] Échec envoi du lien d'invitation ${channel}:`, err);
    await sendText(phone, `Rejoins manuellement ${channel} : ${inviteLink}`).catch(() => {});
  }
}
