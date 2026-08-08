import { PrismaClient, UserPlan } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile, recordPullEvent, recordPullDelivery } from '../../services/pull';
import { getMatchedOffers } from '../../services/matching';
import { getOffset, setOffset, getPullBatchSize } from '../../session/pagination';
import { openWindow } from '../../session/window';
import { deliverJobsBatch } from '../../messages/delivery';
import { sendMessage } from '../../whatsapp/client';
import { formatNoMoreOffers } from '../../messages/formatter';

export async function handleSuite(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await getUserWithProfile(cmd.userId);
  if (!user) return;

  const userPlan = user.plan as UserPlan;

  const sortedOffers = await getMatchedOffers(db, cmd.userId, userPlan, user.profile, user.countries);

  const offset = await getOffset(cmd.userId);
  const batchSize = await getPullBatchSize();
  const batch = sortedOffers.slice(offset, offset + batchSize);

  if (batch.length === 0) {
    await sendMessage(cmd.userId, formatNoMoreOffers(), cmd.country);
    return;
  }

  await deliverJobsBatch(cmd.userId, user.id, batch, userPlan, sendMessage, cmd.country);
  await setOffset(cmd.userId, offset + batchSize);

  recordPullEvent(user.id, batch.length).catch((err) => console.warn('[suite] recordPullEvent:', err));
  recordPullDelivery(user.id, 'SUITE', batch.map((o) => o.id), userPlan).catch((err) =>
    console.warn('[suite] recordPullDelivery:', err),
  );
  await openWindow(cmd.userId);
}
