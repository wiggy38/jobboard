import type { ParsedCommand } from './types';

export function parseIncoming(webhookBody: unknown): ParsedCommand | null {
  const msg = (webhookBody as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return null;

  const userId: string = msg.from;

  if (msg.type === 'text' && typeof msg.text?.body === 'string') {
    const raw: string = msg.text.body;
    return { userId, command: raw.trim().toUpperCase(), raw };
  }

  if (
    msg.type === 'interactive' &&
    msg.interactive?.type === 'button_reply' &&
    typeof msg.interactive.button_reply?.id === 'string'
  ) {
    const raw: string = msg.interactive.button_reply.id;
    return { userId, command: raw.trim().toUpperCase(), raw };
  }

  if (
    msg.type === 'interactive' &&
    msg.interactive?.type === 'list_reply' &&
    typeof msg.interactive.list_reply?.id === 'string'
  ) {
    const raw: string = msg.interactive.list_reply.id;
    return { userId, command: raw.trim().toUpperCase(), raw };
  }

  // delivery status, reaction, or unsupported type — ignore
  return null;
}

export interface DeliveryStatus {
  messageId: string;
  status: string; // sent | delivered | read | failed
  recipientId: string;
  errors?: { code: number; title: string; message?: string }[];
}

// Les accusés de livraison (sent/delivered/read/failed) arrivent dans "statuses",
// pas "messages" — un objet webhook ne contient jamais les deux à la fois.
export function parseStatuses(webhookBody: unknown): DeliveryStatus[] | null {
  const statuses = (webhookBody as any)?.entry?.[0]?.changes?.[0]?.value?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) return null;

  return statuses.map((s: any) => ({
    messageId: s.id,
    status: s.status,
    recipientId: s.recipient_id,
    errors: s.errors,
  }));
}
