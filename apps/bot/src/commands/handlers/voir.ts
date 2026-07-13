import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';

export async function handleVoir(cmd: ParsedCommand, _db: PrismaClient): Promise<void> {
  const parts = cmd.command.trim().split(/\s+/);
  const n = parts[1] ? parseInt(parts[1], 10) : NaN;

  if (isNaN(n) || n < 1 || n > 5) {
    await sendText(cmd.userId, 'Réponds *VOIR 1* à *VOIR 5* pour débloquer une offre.');
    return;
  }

  await sendText(cmd.userId, `🔍 VOIR ${n} — fonctionnalité en cours d'intégration dans le nouveau routeur.\nRéponds *OFFRES* pour actualiser la liste.`);
}
