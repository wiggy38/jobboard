import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile } from '../../services/pull';
import { sendText } from '../../services/whatsapp';

export async function handleStats(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await getUserWithProfile(cmd.userId);
  const profile = user?.profile;

  const hasCities = (profile?.cities?.length ?? 0) > 0;
  const hasSectors = (profile?.sectors?.length ?? 0) > 0;

  const count = await db.jobOffer.count({
    where: {
      status: 'ACTIVE',
      ...(hasCities && { city: { in: profile!.cities } }),
      ...(hasSectors && { sector: { in: profile!.sectors } }),
    },
  });

  const villesStr = hasCities ? profile!.cities.join(', ') : 'Non configuré';
  const secteursStr = hasSectors ? profile!.sectors.join(', ') : 'Non configuré';

  await sendText(
    cmd.userId,
    `📊 *Tes stats Tumaa*\n\n` +
      `🔍 Offres disponibles pour toi : *${count} offres*\n\n` +
      `📍 Villes : ${villesStr}\n\n` +
      `🏢 Secteurs : ${secteursStr}\n\n` +
      `Réponds *OFFRES* pour les recevoir maintenant\n\n` +
      `Réponds *MODIFIER* pour changer tes critères`,
  );
}
