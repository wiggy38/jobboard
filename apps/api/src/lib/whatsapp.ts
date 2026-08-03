// Envoi WhatsApp minimal côté API (Meta Cloud API direct, comme
// apps/bot/src/services/whatsapp.ts) — utilisé uniquement pour le récap de
// fin d'onboarding envoyé depuis /api/subscribe/join-channel. Toute logique
// de conversation (commandes, templates payants, etc.) reste dans apps/bot.

const BASE_URL = 'https://graph.facebook.com/v19.0'

function isDryRun(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  return !token || token === 'EAAxxxx'
}

export async function sendText(to: string, body: string): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} : ${body}`)
    return
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  try {
    const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = (data as { error?: { message?: string } }).error?.message ?? res.statusText
      console.error(`[WhatsApp] Erreur ${res.status}:`, msg)
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur réseau:', err, { to })
  }
}
