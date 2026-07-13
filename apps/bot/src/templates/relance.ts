import type { PrismaClient } from '@prisma/client';
import { sendTemplateIfAllowed } from './counter';

export async function sendRelance(
  userId: string,
  phone: string,
  db: PrismaClient,
): Promise<{ sent: boolean; reason?: string }> {
  return sendTemplateIfAllowed(
    userId,
    'RELANCE',
    {
      type: 'text',
      text: {
        body:
          '👋 *On a des nouvelles offres pour vous !*\n' +
          'Tapez *OFFRES* pour voir les opportunités du jour.\n' +
          'Elles attendent votre profil 🎯',
      },
    },
    phone,
    db,
  );
}
