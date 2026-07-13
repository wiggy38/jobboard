import { TemplateType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { OutgoingMessage } from '../whatsapp/types';
import { sendMessage } from '../whatsapp/client';

const CAPS: Record<TemplateType, number> = {
  RELANCE: 2,
  MATCH_PARFAIT: 1,
  NUDGE_PREMIUM: 1,
};

const GLOBAL_CAP = 3;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function canSendTemplate(
  userId: string,
  type: TemplateType,
  db: PrismaClient,
): Promise<boolean> {
  const month = currentMonth();

  const [typeRow, allRows] = await Promise.all([
    db.templateCounter.findUnique({
      where: { userId_month_type: { userId, month, type } },
    }),
    db.templateCounter.findMany({
      where: { userId, month },
      select: { count: true },
    }),
  ]);

  const typeCount = typeRow?.count ?? 0;
  const totalCount = allRows.reduce((sum, r) => sum + r.count, 0);

  if (totalCount >= GLOBAL_CAP) return false;
  if (typeCount >= CAPS[type]) return false;
  return true;
}

export async function incrementTemplateCounter(
  userId: string,
  type: TemplateType,
  db: PrismaClient,
): Promise<void> {
  const month = currentMonth();

  const existing = await db.templateCounter.findUnique({
    where: { userId_month_type: { userId, month, type } },
    select: { count: true },
  });

  // Double-check safety guard — primary enforcement is in canSendTemplate
  if (existing !== null && existing !== undefined && existing.count >= CAPS[type]) {
    throw new Error(`Template cap reached: ${type} (${existing.count}/${CAPS[type]})`);
  }

  await db.$transaction([
    db.templateCounter.upsert({
      where: { userId_month_type: { userId, month, type } },
      create: { userId, month, type, count: 1 },
      update: { count: { increment: 1 } },
    }),
  ]);
}

export async function sendTemplateIfAllowed(
  userId: string,
  type: TemplateType,
  message: OutgoingMessage,
  to: string,
  db: PrismaClient,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await canSendTemplate(userId, type, db);
  if (!allowed) {
    return { sent: false, reason: 'LIMIT_REACHED' };
  }

  await sendMessage(to, message);
  await incrementTemplateCounter(userId, type, db);

  await db.notification.create({
    data: {
      userId,
      type,
      isPaid: true,
      templateType: type,
      status: 'SENT',
    },
  });

  return { sent: true };
}
