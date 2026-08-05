import { matchJobs, getMatchsParfaits, matchJobsAboveThreshold } from '../src/engine';
import { jobIT, jobStage, jobSponsored, jobOld } from './fixtures/jobs';
import { profileFreemium, profileMaster } from './fixtures/profiles';

const allJobs = [jobOld, jobStage, jobIT, jobSponsored];

describe('matchJobs', () => {
  it('returns results sorted by score descending', () => {
    const results = matchJobs(allJobs, profileFreemium);
    expect(results.length).toBe(4);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  it('returns a result for every job', () => {
    const results = matchJobs(allJobs, profileFreemium);
    expect(results.map((r) => r.jobId).sort()).toEqual(
      allJobs.map((j) => j.id).sort(),
    );
  });

  it('returns empty array for empty job list', () => {
    expect(matchJobs([], profileFreemium)).toEqual([]);
  });

  it('best match for profileFreemium is jobIT (exact city + sector + level + CDI)', () => {
    const results = matchJobs(allJobs, profileFreemium);
    expect(results[0].jobId).toBe('job-1');
  });

  it('best match for profileMaster is jobSponsored (sector + level + city + sponsored)', () => {
    const results = matchJobs(allJobs, profileMaster);
    expect(results[0].jobId).toBe('job-3');
  });
});

describe('getMatchsParfaits', () => {
  it('returns only results with score >= 80', () => {
    const results = getMatchsParfaits(allJobs, profileFreemium);
    expect(results.every((r) => r.isMatchPerfait)).toBe(true);
    expect(results.every((r) => r.score >= 80)).toBe(true);
  });

  it('returns empty array when no job scores >= 80', () => {
    const results = getMatchsParfaits([], profileFreemium);
    expect(results).toEqual([]);
  });

  it('results are sorted by score descending', () => {
    const results = getMatchsParfaits(allJobs, profileMaster);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });
});

describe('matchJobsAboveThreshold', () => {
  it('filters out results below minScore', () => {
    const results = matchJobsAboveThreshold(allJobs, profileFreemium, 50);
    expect(results.every((r) => r.score >= 50)).toBe(true);
  });

  it('returns all results when minScore is 0', () => {
    const results = matchJobsAboveThreshold(allJobs, profileFreemium, 0);
    expect(results.length).toBe(4);
  });

  it('returns empty array when minScore is higher than all scores', () => {
    const results = matchJobsAboveThreshold(allJobs, profileFreemium, 200);
    expect(results).toEqual([]);
  });

  it('results remain sorted by score descending after filtering', () => {
    const results = matchJobsAboveThreshold(allJobs, profileFreemium, 10);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });
});
