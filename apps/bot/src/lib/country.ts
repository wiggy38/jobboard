// Détection du pays depuis le préfixe téléphonique E.164 et mapping vers le
// canal WhatsApp national correspondant (1 canal par pays — voir
// docs/subscription_flow_elite.md et .claude/CLAUDE.md).

import { ELITE_MAX_COUNTRIES, SETTING_KEYS } from '@tumaa/shared';
import { getSetting } from './settings';

export { ELITE_MAX_COUNTRIES };

const COUNTRY_BY_PREFIX: Record<string, string> = {
  '226': 'BF',
  '229': 'BJ',
  '228': 'TG',
  '225': 'CI',
};

export const NATIONAL_CHANNELS: Record<string, string> = {
  BF: '#Emploi-BF',
  BJ: '#Emploi-BJ',
  TG: '#Emploi-TG',
  CI: '#Emploi-CI',
};

// Pays éligibles à la sélection ELITE (commande PAYS) — même ensemble que
// NATIONAL_CHANNELS, un canal WhatsApp national existant par pays supporté.
export const COUNTRY_NAMES: Record<string, string> = {
  BF: 'Burkina Faso',
  BJ: 'Bénin',
  TG: 'Togo',
  CI: "Côte d'Ivoire",
};

export function getCountryFromPhone(phone: string): string {
  // Le webhook Meta Cloud API envoie `from` en E.164 SANS "+" (ex. "22966884820"),
  // mais un numéro saisi manuellement peut en avoir un — on l'ignore dans les deux cas.
  const digits = phone.replace(/^\+/, '');
  const prefix = Object.keys(COUNTRY_BY_PREFIX).find((p) => digits.startsWith(p));
  return prefix ? COUNTRY_BY_PREFIX[prefix] : 'BF';
}

// Lien d'invitation WhatsApp Channel (wa.me/channel/<code>) par pays — Meta ne fournit
// aucune API pour auto-abonner un utilisateur à un Channel, seul le clic de l'utilisateur
// sur ce lien fonctionne. Configuré via env var CHANNEL_INVITE_LINK_<PAYS>.
export async function getChannelInviteLink(country: string): Promise<string | undefined> {
  const links = await getSetting(SETTING_KEYS.CHANNEL_INVITE_LINKS);
  return links[country];
}

// Identifiant WhatsApp du Channel (distinct du lien d'invitation) utilisé
// comme destinataire `to` lors d'une publication via Cloud API — Meta expose
// le Channel comme n'importe quel destinataire une fois qu'on en est
// administrateur. Configuré via env var CHANNEL_ID_<PAYS>.
export function getChannelId(country: string): string | undefined {
  return process.env[`CHANNEL_ID_${country}`];
}
