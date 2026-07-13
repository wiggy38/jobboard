import { JobOffer, UserProfile, ScoreBreakdown, EDUCATION_HIERARCHY, UserPlan } from './types';

export function scoreCity(job: JobOffer, profile: UserProfile): number {
  const jobCity = job.city.trim().toLowerCase();
  return profile.cities.some((c) => c.trim().toLowerCase() === jobCity) ? 35 : 0;
}

export function scoreSector(job: JobOffer, profile: UserProfile): number {
  const jobSector = job.sector.trim().toLowerCase();
  return profile.sectors.some((s) => s.trim().toLowerCase() === jobSector) ? 30 : 0;
}

export function scoreLevel(job: JobOffer, profile: UserProfile): number {
  const jobRank = EDUCATION_HIERARCHY[job.level];
  if (jobRank === undefined) return 0;

  const profileRanks = profile.levels
    .map((l) => EDUCATION_HIERARCHY[l])
    .filter((r): r is number => r !== undefined);

  if (profileRanks.length === 0) return 0;
  if (profileRanks.some((r) => r === jobRank)) return 15;
  if (profileRanks.some((r) => Math.abs(r - jobRank) === 1)) return 8;
  return 0;
}

export function scoreContractType(job: JobOffer, profile: UserProfile): number {
  return profile.contractTypes.includes(job.contractType) ? 10 : 0;
}

export function scoreKeywords(job: JobOffer, profile: UserProfile): number {
  if (profile.plan !== UserPlan.PREMIUM) return 0;
  if (profile.keywords.length === 0) return 0;

  const jobKw = new Set(job.keywords.map((k) => k.toLowerCase()));
  const matchCount = profile.keywords.filter((k) => jobKw.has(k.toLowerCase())).length;
  return Math.round((matchCount / profile.keywords.length) * 5 * 100) / 100;
}

export function scoreRecency(job: JobOffer, now?: Date): number {
  const ref = now ?? new Date();
  const daysSince = (ref.getTime() - job.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 5;
  const score = 5 * Math.pow(0.5, daysSince / 7);
  return Math.round(score * 100) / 100;
}

export function scoreConfidence(job: JobOffer): number {
  return Math.round(job.scoreConfidence * 5 * 100) / 100;
}

export function scoreSponsored(job: JobOffer): number {
  return job.isSponsored ? 5 : 0;
}

export function computeScore(job: JobOffer, profile: UserProfile, now?: Date): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    city: scoreCity(job, profile),
    sector: scoreSector(job, profile),
    level: scoreLevel(job, profile),
    contractType: scoreContractType(job, profile),
    keywords: scoreKeywords(job, profile),
    recency: scoreRecency(job, now),
    confidence: scoreConfidence(job),
    sponsored: scoreSponsored(job),
    total: 0,
  };
  breakdown.total =
    breakdown.city +
    breakdown.sector +
    breakdown.level +
    breakdown.contractType +
    breakdown.keywords +
    breakdown.recency +
    breakdown.confidence +
    breakdown.sponsored;
  return breakdown;
}

export function isMatchPerfait(score: number): boolean {
  return score >= 80;
}

export function scoreJob(
  job: JobOffer,
  profile: UserProfile,
  now?: Date,
): { score: number; breakdown: ScoreBreakdown; isMatchPerfait: boolean } {
  const breakdown = computeScore(job, profile, now);
  return { score: breakdown.total, breakdown, isMatchPerfait: isMatchPerfait(breakdown.total) };
}
