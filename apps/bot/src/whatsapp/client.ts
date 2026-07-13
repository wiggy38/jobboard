import type { OutgoingMessage } from './types';

const BASE_URL = 'https://graph.facebook.com/v19.0';

function isDryRun(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  return !token || token === 'EAAxxxx';
}

export async function sendMessage(to: string, payload: OutgoingMessage): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to}`, JSON.stringify(payload));
    return;
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
