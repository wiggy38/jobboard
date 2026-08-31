import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendInteractiveCtaUrl } from '../../services/whatsapp';
import { generateEditProfileToken, buildEditProfileUrl } from '../../services/tokenService';

export async function handleModifier(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  const token = generateEditProfileToken(user.id);
  await sendInteractiveCtaUrl(
    cmd.userId,
    "✏️ *Modifier ton profil de recherche*\n\nVilles, secteurs, type de contrat, niveau d'études...",
    '👉 Modifier profil',
    buildEditProfileUrl(token),
    cmd.country,
  );
}
