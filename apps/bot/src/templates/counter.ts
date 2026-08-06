import { TemplateType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { SETTING_KEYS } from '@tumaa/shared';
import type { OutgoingMessage } from '../whatsapp/types';
import { sendMessage } from '../whatsapp/client';
import { getSetting } from '../lib/settings';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function canSendTemplate(
  userId: string,
  type: TemplateType,
  db: PrismaClient,
): Promise<boolean> {
  const month = currentMonth();

  const [typeRow, allRows, caps] = await Promise.all([
    db.templateCounter.findUnique({
      where: { userId_month_type: { userId, month, type } },
    }),
    db.templateCounter.findMany({
      where: { userId, month },
      select: { count: true },
    }),
    getSetting(SETTING_KEYS.TEMPLATE_CAPS),
  ]);

  const typeCount = typeRow?.count ?? 0;
  const totalCount = allRows.reduce((sum, r) => sum + r.count, 0);

  if (totalCount >= caps.GLOBAL_CAP) return false;
  if (typeCount >= caps[type]) return false;
  return true;
}

export async function incrementTemplateCounter(
  userId: string,
  type: TemplateType,
  db: PrismaClient,
): Promise<void> {
  const month = currentMonth();

  const [existing, caps] = await Promise.all([
    db.templateCounter.findUnique({
      where: { userId_month_type: { userId, month, type } },
      select: { count: true },
    }),
    getSetting(SETTING_KEYS.TEMPLATE_CAPS),
  ]);

  // Double-check safety guard — primary enforcement is in canSendTemplate
  if (existing !== null && existing !== undefined && existing.count >= caps[type]) {
    throw new Error(`Template cap reached: ${type} (${existing.count}/${caps[type]})`);
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
  country?: string,
): Promise<{ sent: boolean; reason?: string }> {
  const allowed = await canSendTemplate(userId, type, db);
  if (!allowed) {
    return { sent: false, reason: 'LIMIT_REACHED' };
  }

  await sendMessage(to, message, country);
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
