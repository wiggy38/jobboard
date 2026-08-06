// Configuration WhatsApp (token + phone_number_id) par pays — un numéro Meta
// Business distinct par pays est possible côté Cloud API (une même App peut
// gérer plusieurs numéros WABA, tous multiplexés sur un seul webhook via
// `metadata.phone_number_id`). Voir apps/bot/src/lib/country.ts pour le
// pattern équivalent déjà en place pour les Channels (CHANNEL_ID_<PAYS>).

export type WhatsAppNumberConfig = {
  phoneNumberId: string;
  accessToken: string;
};

const SUPPORTED_COUNTRIES = ['BF', 'BJ', 'TG', 'CI'];

// Fallback : numéro générique historique, utilisé si aucun numéro dédié n'est
// configuré pour un pays (migration progressive / dev local).
const FALLBACK_CONFIG: WhatsAppNumberConfig = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
};

function buildConfigByCountry(): Record<string, WhatsAppNumberConfig> {
  const map: Record<string, WhatsAppNumberConfig> = {};
  for (const country of SUPPORTED_COUNTRIES) {
    const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${country}`];
    const accessToken = process.env[`WHATSAPP_ACCESS_TOKEN_${country}`];
    map[country] =
      phoneNumberId && accessToken ? { phoneNumberId, accessToken } : FALLBACK_CONFIG;
  }
  return map;
}

const WA_CONFIG_BY_COUNTRY = buildConfigByCountry();

// Résout la config (token + phone_number_id) du numéro à utiliser pour un pays
// donné. Retombe sur le numéro générique si le pays est inconnu ou non configuré.
export function getWhatsAppConfig(country?: string): WhatsAppNumberConfig {
  if (!country) return FALLBACK_CONFIG;
  return WA_CONFIG_BY_COUNTRY[country] ?? FALLBACK_CONFIG;
}

const PHONE_NUMBER_ID_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(WA_CONFIG_BY_COUNTRY)
    .filter(([, cfg]) => cfg !== FALLBACK_CONFIG)
    .map(([country, cfg]) => [cfg.phoneNumberId, country]),
);

// Résout le pays à partir du `phone_number_id` reçu dans `value.metadata` d'un
// webhook entrant — c'est-à-dire le numéro Tumaa auquel l'utilisateur a écrit,
// par opposition à `getCountryFromPhone()` qui déduit le pays du préfixe de
// l'expéditeur. undefined si le numéro n'est pas reconnu (numéro générique de
// fallback, ou config non encore renseignée pour ce pays).
export function getCountryFromPhoneNumberId(phoneNumberId: string | undefined): string | undefined {
  if (!phoneNumberId) return undefined;
  return PHONE_NUMBER_ID_TO_COUNTRY[phoneNumberId];
}
