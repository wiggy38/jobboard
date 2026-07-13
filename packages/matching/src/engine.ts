import { JobOffer, UserProfile, MatchResult } from './types';
import { computeScore, isMatchPerfait } from './scorer';

export function matchJobs(jobs: JobOffer[], profile: UserProfile, now?: Date): MatchResult[] {
  return jobs
    .map((job) => {
      const breakdown = computeScore(job, profile, now);
      return {
        jobId: job.id,
        score: breakdown.total,
        breakdown,
        isMatchPerfait: isMatchPerfait(breakdown.total),
      } satisfies MatchResult;
    })
    .sort((a, b) => b.score - a.score);
}

export function getMatchsParfaits(jobs: JobOffer[], profile: UserProfile, now?: Date): MatchResult[] {
  return matchJobs(jobs, profile, now).filter((r) => r.isMatchPerfait);
}

export function matchJobsAboveThreshold(
  jobs: JobOffer[],
  profile: UserProfile,
  minScore: number,
  now?: Date,
): MatchResult[] {
  return matchJobs(jobs, profile, now).filter((r) => r.score >= minScore);
}
