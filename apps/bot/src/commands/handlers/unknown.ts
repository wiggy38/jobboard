import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';

export async function handleUnknown(cmd: ParsedCommand, _db: PrismaClient): Promise<void> {
  await sendText(
    cmd.userId,
    '❓ Je n\'ai pas compris cette commande.\n' +
      'Tapez *AIDE* pour voir les commandes disponibles,\n' +
      'ou *OFFRES* pour recevoir vos offres du jour.',
  );
}
