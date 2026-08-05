export interface JobOffer {
  id: string;
  title: string;
  organization: string;
  city: string;
  sector: string;
  level: string;
  contractType: ContractType;
  keywords: string[];
  publishedAt: Date;
  scoreConfidence: number;
  isSponsored: boolean;
  isFeatured: boolean;
}

export interface UserProfile {
  userId: string;
  cities: string[];
  sectors: string[];
  levels: string[];
  contractTypes: ContractType[];
  keywords: string[];
  plan: UserPlan;
}

export enum ContractType {
  CDI = 'CDI',
  CDD = 'CDD',
  STAGE = 'STAGE',
  ALTERNANCE = 'ALTERNANCE',
  FREELANCE = 'FREELANCE',
  BENEVOLE = 'BENEVOLE',
  AUTRE = 'AUTRE',
}

export enum UserPlan {
  FREEMIUM = 'FREEMIUM',
  PREMIUM = 'PREMIUM',
}

export interface ScoreBreakdown {
  city: number;
  sector: number;
  level: number;
  contractType: number;
  confidence: number;
  sponsored: number;
  featured: number;
  total: number;
}

export interface MatchResult {
  jobId: string;
  score: number;
  breakdown: ScoreBreakdown;
  isMatchPerfait: boolean;
}

// Rangs utilisés uniquement pour déterminer le niveau MAX d'un profil (celui dont la
// fenêtre de correspondance LEVEL_MATCH_WINDOWS ci-dessous s'applique) — le scoring
// lui-même ne compare plus des rangs, voir scoreLevel dans scorer.ts.
export const EDUCATION_HIERARCHY: Record<string, number> = {
  'Sans diplôme': 0,
  'CEP': 1,
  'BEPC': 2,
  'BAC': 3,
  'BAC+1': 4,
  'BAC+2': 5,
  'BTS': 5,
  'DUT': 5,
  'Licence': 6,
  'BAC+3': 6,
  'BAC+4': 7,
  'Master': 8,
  'BAC+5': 8,
  'DEA': 8,
  'DESS': 8,
  'Doctorat': 9,
  'PhD': 9,
};

// Synonymes renvoyant vers le niveau canonique utilisé comme clé dans
// LEVEL_MATCH_WINDOWS (côté profil comme côté offre).
export const LEVEL_SYNONYMS: Record<string, string> = {
  'BTS': 'BAC+2',
  'DUT': 'BAC+2',
  'BAC+3': 'Licence',
  'BAC+5': 'Master',
  'DEA': 'Master',
  'DESS': 'Master',
  'PhD': 'Doctorat',
};

export function canonicalLevel(level: string): string {
  return LEVEL_SYNONYMS[level] ?? level;
}

// Fenêtre de correspondance par niveau max de profil : liste des niveaux d'offre
// acceptés et leur score, ordonnée du plus proche au plus éloigné. Un niveau d'offre
// absent de la fenêtre du profil (ex. BAC+4, ou un niveau supérieur au profil) score 0.
// Table validée manuellement avec le métier — n'est pas dérivable d'une formule
// générique sur les rangs (quelques fenêtres ont des tailles ou des sauts différents).
export const LEVEL_MATCH_WINDOWS: Record<string, { level: string; score: number }[]> = {
  'CEP': [
    { level: 'CEP', score: 15 },
  ],
  'Sans diplôme': [
    { level: 'Sans diplôme', score: 15 },
    { level: 'CEP', score: 12 },
  ],
  'BEPC': [
    { level: 'BEPC', score: 15 },
    { level: 'CEP', score: 12 },
    { level: 'Sans diplôme', score: 10 },
  ],
  'BAC': [
    { level: 'BAC', score: 15 },
    { level: 'BEPC', score: 12 },
    { level: 'CEP', score: 10 },
    { level: 'Sans diplôme', score: 8 },
  ],
  'BAC+1': [
    { level: 'BAC+1', score: 15 },
    { level: 'BAC', score: 12 },
    { level: 'BEPC', score: 10 },
    { level: 'CEP', score: 8 },
  ],
  'BAC+2': [
    { level: 'BAC+2', score: 15 },
    { level: 'BAC+1', score: 12 },
    { level: 'BAC', score: 10 },
    { level: 'BEPC', score: 8 },
  ],
  'Licence': [
    { level: 'Licence', score: 15 },
    { level: 'BAC+2', score: 12 },
    { level: 'BAC+1', score: 10 },
    { level: 'BAC', score: 8 },
  ],
  'Master': [
    { level: 'Master', score: 15 },
    { level: 'Licence', score: 12 },
    { level: 'BAC+2', score: 10 },
    { level: 'BAC+1', score: 8 },
    { level: 'BAC', score: 6 },
  ],
  'Doctorat': [
    { level: 'Doctorat', score: 15 },
    { level: 'Master', score: 12 },
    { level: 'Licence', score: 10 },
    { level: 'BAC+2', score: 8 },
  ],
};
