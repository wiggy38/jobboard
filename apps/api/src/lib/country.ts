// Pays éligibles à la sélection ELITE — même ensemble que apps/bot/src/lib/country.ts
// (1 canal WhatsApp national par pays, voir .claude/CLAUDE.md).

import { ELITE_MAX_COUNTRIES, SETTING_KEYS } from '@tumaa/shared'
import { getSetting } from './settings'

export { ELITE_MAX_COUNTRIES }

export const COUNTRY_NAMES: Record<string, string> = {
  BF: 'Burkina Faso',
  BJ: 'Bénin',
  TG: 'Togo',
  CI: "Côte d'Ivoire",
}

export const NATIONAL_CHANNELS: Record<string, string> = {
  BF: '#Emploi-BF',
  BJ: '#Emploi-BJ',
  TG: '#Emploi-TG',
  CI: '#Emploi-CI',
}

export async function getChannelInviteLink(country: string): Promise<string | undefined> {
  const links = await getSetting(SETTING_KEYS.CHANNEL_INVITE_LINKS)
  return links[country]
}

// Détection du pays depuis le préfixe téléphonique E.164 — dupliqué depuis
// apps/bot/src/lib/country.ts (même logique, pas de dépendance croisée entre
// apps). Utilisé pour déterminer le canal WhatsApp national de l'abonné
// (1 canal = celui de son propre pays, indépendamment des pays de recherche
// ELITE — voir /api/subscribe/join-channel).
const COUNTRY_BY_PREFIX: Record<string, string> = {
  '226': 'BF',
  '229': 'BJ',
  '228': 'TG',
  '225': 'CI',
}

export function getCountryFromPhone(phone: string): string {
  // Le webhook Meta Cloud API envoie `from` en E.164 SANS "+" (ex. "22966884820"),
  // mais un numéro saisi manuellement peut en avoir un — on l'ignore dans les deux cas.
  const digits = phone.replace(/^\+/, '')
  const prefix = Object.keys(COUNTRY_BY_PREFIX).find((p) => digits.startsWith(p))
  return prefix ? COUNTRY_BY_PREFIX[prefix] : 'BF'
}
