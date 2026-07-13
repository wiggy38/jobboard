import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';
import { setState } from '../../session/state';

export async function handleModifier(cmd: ParsedCommand, _db: PrismaClient): Promise<void> {
  await sendText(
    cmd.userId,
    '✏️ *Modifier ton profil de recherche*\n\n' +
      'Que veux-tu modifier ?\n\n' +
      '1 — Villes de recherche\n' +
      '2 — Secteurs d\'activité\n' +
      '3 — Niveau d\'études\n' +
      '4 — Type de contrat\n\n' +
      'Réponds *1*, *2*, *3* ou *4*.',
  );
  await setState(cmd.userId, { step: 'MODIFIER_CHOICE', data: {} });
}
