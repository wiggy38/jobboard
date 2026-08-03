// Options ville/secteur/type de contrat pour un profil FREEMIUM — source de
// vérité unique, utilisée par la page web /subscribe (formulaire Freemium) et
// par l'API (validation). Anciennement dupliquées dans l'onboarding WhatsApp
// (apps/bot), retiré au profit du choix de formule sur /subscribe.

export type ContractType = 'CDI' | 'CDD' | 'STAGE' | 'ALTERNANCE' | 'FREELANCE' | 'BENEVOLE' | 'AUTRE'

export interface ProfileOption {
  value: string
  label: string
}

export const CITY_OPTIONS: ProfileOption[] = [
  { value: 'Ouagadougou', label: 'Ouagadougou' },
  { value: 'Bobo-Dioulasso', label: 'Bobo-Dioulasso' },
  { value: 'Koudougou', label: 'Koudougou' },
  { value: 'Ouahigouya', label: 'Ouahigouya' },
  { value: 'Banfora', label: 'Banfora' },
  { value: 'Kaya', label: 'Kaya' },
  { value: 'Tenkodogo', label: 'Tenkodogo' },
  { value: "Fada N'Gourma", label: "Fada N'Gourma" },
  { value: 'Dédougou', label: 'Dédougou' },
]

export const SECTOR_OPTIONS: ProfileOption[] = [
  { value: 'Informatique', label: 'Informatique' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Comptabilité', label: 'Comptabilité' },
  { value: 'Santé', label: 'Santé' },
  { value: 'Agriculture', label: 'Agriculture' },
  { value: 'Éducation', label: 'Éducation' },
  { value: 'ONG/Humanitaire', label: 'ONG/Humanitaire' },
  { value: 'BTP/Construction', label: 'BTP/Construction' },
  { value: 'Transport/Logistique', label: 'Transport/Logistique' },
  { value: 'Droit/Juridique', label: 'Droit/Juridique' },
  { value: 'Communication/Marketing', label: 'Communication/Marketing' },
  { value: 'Ressources Humaines', label: 'Ressources Humaines' },
  { value: 'Commerce/Vente', label: 'Commerce/Vente' },
]

// Sous-ensemble volontairement simplifié de EDUCATION_HIERARCHY
// (packages/matching/src/types.ts) — chaque label ci-dessous existe comme clé
// de EDUCATION_HIERARCHY pour que le scoring (scoreLevel) fonctionne sans
// changement. packages/matching reste pur (aucune dépendance), donc cette
// liste est dupliquée intentionnellement et doit être maintenue en cohérence
// manuellement avec EDUCATION_HIERARCHY.
export const LEVEL_OPTIONS: ProfileOption[] = [
  { value: 'Sans diplôme', label: 'Sans diplôme' },
  { value: 'BEPC', label: 'BEPC' },
  { value: 'BAC', label: 'BAC' },
  { value: 'BAC+2', label: 'BAC+2' },
  { value: 'Licence', label: 'Licence' },
  { value: 'Master', label: 'Master' },
  { value: 'Doctorat', label: 'Doctorat' },
]

export type ContractGroupId = 'CONTRACT_CDI' | 'CONTRACT_CDD' | 'CONTRACT_ALL'

export const CONTRACT_GROUPS: Record<ContractGroupId, { label: string; types: ContractType[] }> = {
  CONTRACT_CDI: { label: 'CDI', types: ['CDI'] },
  CONTRACT_CDD: { label: 'CDD / Stage', types: ['CDD', 'STAGE'] },
  CONTRACT_ALL: { label: 'Tous types', types: ['CDI', 'CDD', 'STAGE', 'FREELANCE'] },
}
