// Pays éligibles à la sélection ELITE — même ensemble que apps/bot/src/lib/country.ts
// (1 canal WhatsApp national par pays, voir .claude/CLAUDE.md).

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

export const ELITE_MAX_COUNTRIES = 3

export function getChannelInviteLink(country: string): string | undefined {
  return process.env[`CHANNEL_INVITE_LINK_${country}`]
}
