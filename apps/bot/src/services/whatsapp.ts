const BASE_URL = 'https://graph.facebook.com/v19.0';

function isDryRun(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  return !token || token === 'EAAxxxx';
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  };
}

async function post(payload: object): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: getHeaders(),
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

export async function sendText(to: string, body: string): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} : ${body}`);
    return;
  }

  await post({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} interactive:`, { bodyText, buttons });
    return;
  }

  await post({
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
  });
}

export async function sendInteractiveCtaUrl(
  to: string,
  bodyText: string,
  displayText: string,
  url: string,
): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} cta_url:`, { bodyText, displayText, url });
    return;
  }

  await post({
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
  });
}

export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} list:`, { bodyText, buttonLabel, sections });
    return;
  }

  await post({
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
  });
}

// AVERTISSEMENT : Ne jamais appeler cette fonction directement depuis les handlers.
// Elle doit toujours passer par le guard TemplateCounter (étape 5) pour respecter
// la limite de 3 templates payants par utilisateur par mois.
export async function sendTemplate(
  to: string,
  templateName: string,
  components: object[],
): Promise<void> {
  if (isDryRun()) {
    console.log(`[WhatsApp DRY-RUN] → ${to} template:${templateName}`, components);
    return;
  }

  await post({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'fr' },
      components,
    },
  });
}
