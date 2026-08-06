import { PrismaClient, UserPlan } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile, upsertUser, recordPullEvent, recordPullDelivery } from '../../services/pull';
import { getMatchedOffers } from '../../services/matching';
import { getOffset, setOffset, resetOffset, getPullBatchSize } from '../../session/pagination';
import { openWindow } from '../../session/window';
import { deliverJobsBatch } from '../../messages/delivery';
import { sendMessage } from '../../whatsapp/client';
import { sendText } from '../../services/whatsapp';
import { formatNoMoreOffers } from '../../messages/formatter';

async function handleOnboarding(phone: string, country?: string): Promise<void> {
  await upsertUser(phone);
  await sendText(
    phone,
    '👋 Bienvenue sur *Tumaa* !\n\n' +
      'Je suis ton assistant emploi sur WhatsApp 🇧🇫\n' +
      'Je cherche les meilleures offres d\'emploi au Burkina Faso pour toi.\n\n' +
      'Voici tes premières offres :\n' +
      '_(Réponds *MODIFIER* pour affiner ta recherche par ville ou secteur)_',
    country,
  );
}

export async function handleOffres(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  let user = await getUserWithProfile(cmd.userId);

  if (!user) {
    await handleOnboarding(cmd.userId, cmd.country);
    user = await getUserWithProfile(cmd.userId);
  }

  if (!user) return;

  const userPlan = user.plan as UserPlan;

  const sortedOffers = await getMatchedOffers(db, cmd.userId, userPlan, user.profile, user.countries);

  await resetOffset(cmd.userId);
  const offset = 0;
  const batchSize = await getPullBatchSize();
  const batch = sortedOffers.slice(offset, offset + batchSize);

  if (batch.length === 0) {
    await sendMessage(cmd.userId, formatNoMoreOffers(), cmd.country);
  } else {
    await deliverJobsBatch(cmd.userId, user.id, batch, userPlan, sendMessage, cmd.country);
    await setOffset(cmd.userId, offset + batchSize);
  }

  recordPullEvent(user.id, batch.length).catch((err) => console.warn('[offres] recordPullEvent:', err));
  recordPullDelivery(user.id, 'OFFRES', batch.map((o) => o.id)).catch((err) =>
    console.warn('[offres] recordPullDelivery:', err),
  );
  await openWindow(cmd.userId);
}
