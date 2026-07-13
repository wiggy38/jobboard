import { canSendTemplate, recordRelanceAttempt } from '../counters';
import type { TemplateType } from '../counters/templateCounter';
import { sendTemplate } from './whatsapp';

export async function sendPaidTemplate(
  to: string,
  userId: string,
  type: TemplateType,
  templateName: string,
  components: object[],
): Promise<{ sent: boolean; reason?: string }> {
  const { allowed, reason } = await canSendTemplate(userId, type);
  if (!allowed) {
    console.warn(JSON.stringify({ event: 'template_blocked', userId, type, reason }));
    return { sent: false, reason };
  }

  await sendTemplate(to, templateName, components);

  if (type === 'RELANCE') {
    await recordRelanceAttempt(userId);
  }

  return { sent: true };
}
