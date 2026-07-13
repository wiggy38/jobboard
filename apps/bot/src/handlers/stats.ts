import { BotContext } from '../types';
import { getUserWithProfile } from '../services/pull';
import { sendText } from '../services/whatsapp';
import { prisma } from '../lib/prisma';

export async function handleStats(ctx: BotContext): Promise<void> {
  const user = await getUserWithProfile(ctx.message.from);
  const profile = user?.profile;

  const hasCities = (profile?.cities?.length ?? 0) > 0;
  const hasSectors = (profile?.sectors?.length ?? 0) > 0;

  const count = await prisma.jobOffer.count({
    where: {
      status: 'ACTIVE',
      ...(hasCities && { city: { in: profile!.cities } }),
      ...(hasSectors && { sector: { in: profile!.sectors } }),
    },
  });

  const villesStr = hasCities ? profile!.cities.join(', ') : 'Non configuré';
  const secteursStr = hasSectors ? profile!.sectors.join(', ') : 'Non configuré';

  await sendText(
    ctx.message.from,
    `📊 Tes stats Tumaa\n\n` +
      `🔍 Offres disponibles pour toi : ${count} offres\n\n` +
      `📍 Villes : ${villesStr}\n\n` +
      `🏢 Secteurs : ${secteursStr}\n\n` +
      `Réponds OFFRES pour les recevoir maintenant\n\n` +
      `Réponds MODIFIER pour changer tes critères`,
  );
}
