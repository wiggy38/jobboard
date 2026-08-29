import { isUnlimited } from './planLimits'

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function formatCities(n: number): string {
  return isUnlimited(n) ? 'villes illimitées' : `${n} ${pluralize(n, 'ville', 'villes')}`
}

export function formatSectors(n: number): string {
  return isUnlimited(n) ? 'secteurs illimités' : `${n} ${pluralize(n, 'secteur', 'secteurs')}`
}

export function formatContractGroups(n: number): string {
  return `${n} ${pluralize(n, 'type de contrat', 'types de contrat')}`
}

// "3 villes + 3 secteurs + 3 types de contrat" — utilisé dans les messages
// WhatsApp (bot) listant les formules, à partir des limites réellement
// configurées (SETTING_KEYS.PLAN_LIMITS), jamais de valeurs codées en dur.
export function planLimitsLine(limits: { maxCities: number; maxSectors: number; maxContractGroups: number }): string {
  return `${formatCities(limits.maxCities)} + ${formatSectors(limits.maxSectors)} + ${formatContractGroups(limits.maxContractGroups)}`
}
