import type { OutgoingMessage } from './types';
import { getWhatsAppConfig } from './config';

const BASE_URL = 'https://graph.facebook.com/v19.0';

function isDryRun(accessToken: string): boolean {
  return !accessToken || accessToken === 'EAAxxxx';
}

export async function sendMessage(to: string, payload: OutgoingMessage, country?: string): Promise<void> {
  const { phoneNumberId, accessToken } = getWhatsAppConfig(country);

  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to}`, JSON.stringify(payload));
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        ...payload,
      }),
    });
  } catch (err) {
    console.error('[WhatsApp] Erreur réseau:', err, { to, type: payload.type });
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
    console.error(`[WhatsApp] Erreur ${res.status}: ${msg}`, { to, type: payload.type });
    return;
  }

  const data = await res.json().catch(() => ({}));
  console.log('[WhatsApp] Envoyé:', JSON.stringify(data));
}
