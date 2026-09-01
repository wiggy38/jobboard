import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';
import { logUnknownCommandToFile } from '../../services/unknownCommandLogger';

export async function handleUnknown(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  try {
    await db.unknownCommandLog.create({
      data: {
        phoneNumber: cmd.userId,
        raw: cmd.raw,
        command: cmd.command,
        country: cmd.country,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'unknown_command_log_failed', err: String(err) }));
  }

  await logUnknownCommandToFile(cmd);

  await sendText(
    cmd.userId,
    '❓ Je n\'ai pas compris cette commande.\n' +
      'Tapez *AIDE* pour voir les commandes disponibles,\n' +
      'ou *OFFRES* pour recevoir vos offres du jour.',
    cmd.country,
  );
}
