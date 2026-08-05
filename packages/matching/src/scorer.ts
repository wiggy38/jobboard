import {
  JobOffer,
  UserProfile,
  ScoreBreakdown,
  EDUCATION_HIERARCHY,
  LEVEL_MATCH_WINDOWS,
  canonicalLevel,
} from './types';

export function scoreCity(job: JobOffer, profile: UserProfile): number {
  const jobCity = job.city.trim().toLowerCase();
  return profile.cities.some((c) => c.trim().toLowerCase() === jobCity) ? 35 : 0;
}

export function scoreSector(job: JobOffer, profile: UserProfile): number {
  const jobSector = job.sector.trim().toLowerCase();
  return profile.sectors.some((s) => s.trim().toLowerCase() === jobSector) ? 30 : 0;
}

// profile.levels représente le niveau d'études MAXIMUM recherché par l'utilisateur.
// Le score dépend de la fenêtre de correspondance LEVEL_MATCH_WINDOWS associée à ce
// niveau max (voir types.ts) — pas d'un simple écart de rang.
export function scoreLevel(job: JobOffer, profile: UserProfile): number {
  const profileRanks = profile.levels
    .map((l) => EDUCATION_HIERARCHY[l])
    .filter((r): r is number => r !== undefined);
  if (profileRanks.length === 0) return 0;

  const maxProfileRank = Math.max(...profileRanks);
  const maxProfileLevel = profile.levels.find((l) => EDUCATION_HIERARCHY[l] === maxProfileRank);
  if (maxProfileLevel === undefined) return 0;

  const window = LEVEL_MATCH_WINDOWS[canonicalLevel(maxProfileLevel)];
  if (window === undefined) return 0;

  const jobCanonical = canonicalLevel(job.level);
  const match = window.find((w) => w.level === jobCanonical);
  return match ? match.score : 0;
}

export function scoreContractType(job: JobOffer, profile: UserProfile): number {
  return profile.contractTypes.includes(job.contractType) ? 10 : 0;
}

export function scoreConfidence(job: JobOffer): number {
  return Math.round(job.scoreConfidence * 5 * 100) / 100;
}

export function scoreSponsored(job: JobOffer): number {
  return job.isSponsored ? 5 : 0;
}

export function scoreFeatured(job: JobOffer): number {
  return job.isFeatured ? 5 : 0;
}

export function computeScore(job: JobOffer, profile: UserProfile): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    city: scoreCity(job, profile),
    sector: scoreSector(job, profile),
    level: scoreLevel(job, profile),
    contractType: scoreContractType(job, profile),
    confidence: scoreConfidence(job),
    sponsored: scoreSponsored(job),
    featured: scoreFeatured(job),
    total: 0,
  };
  breakdown.total =
    breakdown.city +
    breakdown.sector +
    breakdown.level +
    breakdown.contractType +
    breakdown.confidence +
    breakdown.sponsored +
    breakdown.featured;
  return breakdown;
}

export function isMatchPerfait(score: number): boolean {
  return score >= 80;
}

export function scoreJob(
  job: JobOffer,
  profile: UserProfile,
): { score: number; breakdown: ScoreBreakdown; isMatchPerfait: boolean } {
  const breakdown = computeScore(job, profile);
  return { score: breakdown.total, breakdown, isMatchPerfait: isMatchPerfait(breakdown.total) };
}
