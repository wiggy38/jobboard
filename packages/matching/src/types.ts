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
  keywords: number;
  recency: number;
  confidence: number;
  sponsored: number;
  total: number;
}

export interface MatchResult {
  jobId: string;
  score: number;
  breakdown: ScoreBreakdown;
  isMatchPerfait: boolean;
}

export const EDUCATION_HIERARCHY: Record<string, number> = {
  'Sans diplôme': 0,
  'BEPC': 1,
  'BAC': 2,
  'BAC+2': 3,
  'BTS': 3,
  'DUT': 3,
  'Licence': 4,
  'BAC+3': 4,
  'BAC+4': 5,
  'Master': 6,
  'BAC+5': 6,
  'DEA': 6,
  'DESS': 6,
  'Doctorat': 7,
  'PhD': 7,
};
