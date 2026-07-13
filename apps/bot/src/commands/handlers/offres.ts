import { PrismaClient, UserPlan } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile, upsertUser, recordPullEvent } from '../../services/pull';
import { getMatchedOffers } from '../../services/matching';
import { getOffset, setOffset, resetOffset } from '../../session/pagination';
import { openWindow } from '../../session/window';
import { deliverJobsBatch } from '../../messages/delivery';
import { sendMessage } from '../../whatsapp/client';
import { sendText } from '../../services/whatsapp';
import { formatNoMoreOffers } from '../../messages/formatter';

async function handleOnboarding(phone: string): Promise<void> {
  await upsertUser(phone);
  await sendText(
    phone,
    '👋 Bienvenue sur *Tumaa* !\n\n' +
      'Je suis ton assistant emploi sur WhatsApp 🇧🇫\n' +
      'Je cherche les meilleures offres d\'emploi au Burkina Faso pour toi.\n\n' +
      'Voici tes premières offres :\n' +
      '_(Réponds *MODIFIER* pour affiner ta recherche par ville ou secteur)_',
  );
}

export async function handleOffres(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  let user = await getUserWithProfile(cmd.userId);

  if (!user) {
    await handleOnboarding(cmd.userId);
    user = await getUserWithProfile(cmd.userId);
  }

  if (!user) return;

  const userPlan = user.plan as UserPlan;

  const sortedOffers = await getMatchedOffers(db, cmd.userId, userPlan, user.profile, user.countries);

  await resetOffset(cmd.userId);
  const offset = 0;
  const batch = sortedOffers.slice(offset, offset + 5);

  if (batch.length === 0) {
    await sendMessage(cmd.userId, formatNoMoreOffers());
  } else {
    await deliverJobsBatch(cmd.userId, user.id, batch, userPlan, sendMessage);
    await setOffset(cmd.userId, offset + 5);
  }

  recordPullEvent(user.id).catch((err) => console.warn('[offres] recordPullEvent:', err));
  await openWindow(cmd.userId);
}
