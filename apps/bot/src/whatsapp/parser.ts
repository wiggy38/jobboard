import type { ParsedCommand } from './types';
import { getCountryFromPhoneNumberId } from './config';

// Détecte un suffixe "REF-XXXXXXXX" (code de parrainage embarqué dans le lien
// wa.me pré-rempli sur la page offre — voir shortlink flow, apps/api/src/offre.routes.ts
// et apps/backoffice/src/routes/offre/[token]/+page.svelte) et le sépare de la
// commande proprement dite. N'affecte pas les commandes sans suffixe.
function splitReferral(raw: string): { command: string; referralCode?: string } {
  const trimmed = raw.trim().toUpperCase();
  const match = trimmed.match(/^(\S+)\s+REF-([A-Z0-9]{6,12})$/);
  return match ? { command: match[1], referralCode: match[2] } : { command: trimmed };
}

export function parseIncoming(webhookBody: unknown): ParsedCommand | null {
  const value = (webhookBody as any)?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null;

  const userId: string = msg.from;
  const country = getCountryFromPhoneNumberId(value?.metadata?.phone_number_id);

  if (msg.type === 'text' && typeof msg.text?.body === 'string') {
    const raw: string = msg.text.body;
    return { userId, ...splitReferral(raw), raw, country };
  }

  if (
    msg.type === 'interactive' &&
    msg.interactive?.type === 'button_reply' &&
    typeof msg.interactive.button_reply?.id === 'string'
  ) {
    const raw: string = msg.interactive.button_reply.id;
    return { userId, ...splitReferral(raw), raw, country };
  }

  if (
    msg.type === 'interactive' &&
    msg.interactive?.type === 'list_reply' &&
    typeof msg.interactive.list_reply?.id === 'string'
  ) {
    const raw: string = msg.interactive.list_reply.id;
    return { userId, ...splitReferral(raw), raw, country };
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
