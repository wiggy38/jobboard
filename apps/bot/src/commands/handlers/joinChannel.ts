import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { joinNationalChannel } from '../../services/channels';

// Envoie, pour chaque pays de l'utilisateur, le lien d'invitation réel du canal
// WhatsApp national (voir services/channels.ts — Meta n'expose pas d'API pour
// auto-abonner un utilisateur, seul le clic sur ce lien fait rejoindre le canal).
export async function handleJoinChannel(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  const countries = user.countries.length > 0 ? user.countries : ['BF'];

  for (const country of countries) {
    await joinNationalChannel(db, user.id, user.phone, country);
  }
}
