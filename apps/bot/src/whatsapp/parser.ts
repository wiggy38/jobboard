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
