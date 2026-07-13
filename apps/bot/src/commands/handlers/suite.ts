import { PrismaClient, UserPlan } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile, recordPullEvent } from '../../services/pull';
import { getMatchedOffers } from '../../services/matching';
import { getOffset, setOffset } from '../../session/pagination';
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
  const batch = sortedOffers.slice(offset, offset + 5);

  if (batch.length === 0) {
    await sendMessage(cmd.userId, formatNoMoreOffers());
    return;
  }

  await deliverJobsBatch(cmd.userId, user.id, batch, userPlan, sendMessage);
  await setOffset(cmd.userId, offset + 5);

  recordPullEvent(user.id).catch((err) => console.warn('[suite] recordPullEvent:', err));
  await openWindow(cmd.userId);
}
