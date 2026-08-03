// Détection du pays depuis le préfixe téléphonique E.164 et mapping vers le
// canal WhatsApp national correspondant (1 canal par pays — voir
// docs/subscription_flow_elite.md et .claude/CLAUDE.md).

export { ELITE_MAX_COUNTRIES } from '@tumaa/shared';

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
export function getChannelInviteLink(country: string): string | undefined {
  return process.env[`CHANNEL_INVITE_LINK_${country}`];
}
