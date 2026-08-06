import { getWhatsAppConfig } from '../whatsapp/config';

const BASE_URL = 'https://graph.facebook.com/v19.0';

function isDryRun(accessToken: string): boolean {
  return !accessToken || accessToken === 'EAAxxxx';
}

async function post(payload: object, country?: string): Promise<void> {
  const { phoneNumberId, accessToken } = getWhatsAppConfig(country);

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
    console.error(`[WhatsApp] Erreur ${res.status}:`, msg);
    throw new Error(`WhatsApp API ${res.status}: ${msg}`);
  }

  const data = await res.json().catch(() => ({}));
  console.log('[WhatsApp] Envoyé:', JSON.stringify(data));
}

export async function sendText(to: string, body: string, country?: string): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to} : ${body}`);
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    },
    country,
  );
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  country?: string,
): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to} interactive:`, { bodyText, buttons });
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    country,
  );
}

export async function sendInteractiveCtaUrl(
  to: string,
  bodyText: string,
  displayText: string,
  url: string,
  country?: string,
): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to} cta_url:`, { bodyText, displayText, url });
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: bodyText },
        action: {
          name: 'cta_url',
          parameters: { display_text: displayText, url },
        },
      },
    },
    country,
  );
}

export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
  country?: string,
): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to} list:`, { bodyText, buttonLabel, sections });
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections,
        },
      },
    },
    country,
  );
}

// Publie un message texte sur un WhatsApp Channel (canal national #Emploi-XX,
// distinct des messages 1:1) — le channelId est le destinataire `to`, comme
// pour un utilisateur, une fois que le compte Business en est administrateur.
// `country` détermine avec quel numéro Tumaa le message est posté — doit
// correspondre au pays du canal (le Channel appartient au numéro qui l'a créé).
export async function postToChannel(channelId: string, body: string, country?: string): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → channel:${channelId} : ${body}`);
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to: channelId,
      type: 'text',
      text: { body, preview_url: false },
    },
    country,
  );
}

// AVERTISSEMENT : Ne jamais appeler cette fonction directement depuis les handlers.
// Elle doit toujours passer par le guard TemplateCounter (étape 5) pour respecter
// la limite de 3 templates payants par utilisateur par mois.
export async function sendTemplate(
  to: string,
  templateName: string,
  components: object[],
  country?: string,
): Promise<void> {
  const { accessToken } = getWhatsAppConfig(country);
  if (isDryRun(accessToken)) {
    console.log(`[WhatsApp DRY-RUN] → ${to} template:${templateName}`, components);
    return;
  }

  await post(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'fr' },
        components,
      },
    },
    country,
  );
}
