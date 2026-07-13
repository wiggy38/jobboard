import { scoreJob } from '../src/scorer';
import { ContractType, UserPlan, EDUCATION_HIERARCHY } from '../src/types';
import { jobIT, jobStage, jobSponsored, jobOld, NOW } from './fixtures/jobs';
import { profileFreemium, profileEssentiel, profilePro, profileMaster } from './fixtures/profiles';

describe('scoreJob — city', () => {
  it('scores 35 when city matches', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.city).toBe(35);
  });

  it('scores 0 when city does not match', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.city).toBe(0);
  });
});

describe('scoreJob — sector', () => {
  it('scores 30 when sector matches', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.sector).toBe(30);
  });

  it('scores 0 when sector does not match', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.sector).toBe(0);
  });
});

describe('scoreJob — level', () => {
  it('scores 15 for exact level match', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.level).toBe(15);
  });

  it('scores 8 for adjacent level (BAC+2 vs Licence rank diff = 1)', () => {
    const result = scoreJob(jobStage, profileEssentiel, NOW);
    expect(result.breakdown.level).toBe(15);
  });

  it('scores 8 for BAC+2 when profile has Licence', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.level).toBe(8);
  });

  it('Licence (rank 4) and Master (rank 6) are not adjacent — scores 0', () => {
    const lRank = EDUCATION_HIERARCHY['Licence'];
    const mRank = EDUCATION_HIERARCHY['Master'];
    expect(Math.abs(lRank - mRank)).toBe(2);

    const result = scoreJob(jobSponsored, profileFreemium, NOW);
    expect(result.breakdown.level).toBe(0);
  });

  it('scores 0 when level is unknown', () => {
    const unknownJob = { ...jobIT, level: 'Inconnu' };
    const result = scoreJob(unknownJob, profileFreemium, NOW);
    expect(result.breakdown.level).toBe(0);
  });

  it('scores 0 when all profile levels are unknown/unmapped', () => {
    const profileUnknownLevels = { ...profileFreemium, levels: ['NiveauInconnu'] };
    const result = scoreJob(jobIT, profileUnknownLevels, NOW);
    expect(result.breakdown.level).toBe(0);
  });
});

describe('scoreJob — contractType', () => {
  it('scores 10 when contract type matches', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.contractType).toBe(10);
  });

  it('scores 0 when contract type does not match', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.contractType).toBe(0);
  });
});

describe('scoreJob — keywords', () => {
  it('scores 0 for Freemium regardless of keyword overlap', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.keywords).toBe(0);
  });

  it('scores 0 for Essentiel plan', () => {
    const result = scoreJob(jobStage, profileEssentiel, NOW);
    expect(result.breakdown.keywords).toBe(0);
  });

  it('scores proportional to keyword overlap for Pro', () => {
    const result = scoreJob(jobIT, profilePro, NOW);
    const matches = 2;
    const expected = (matches / profilePro.keywords.length) * 5;
    expect(result.breakdown.keywords).toBeCloseTo(expected);
  });

  it('scores 5 when all profile keywords are in job', () => {
    const result = scoreJob(jobSponsored, profileMaster, NOW);
    expect(result.breakdown.keywords).toBe(5);
  });

  it('scores 0 for Pro with empty keywords list', () => {
    const proNoKw = { ...profilePro, keywords: [] };
    const result = scoreJob(jobIT, proNoKw, NOW);
    expect(result.breakdown.keywords).toBe(0);
  });

  it('scores 0 for Pro when no profile keywords appear in job', () => {
    const proNoMatch = { ...profilePro, keywords: ['cobol', 'assembler'] };
    const result = scoreJob(jobIT, proNoMatch, NOW);
    expect(result.breakdown.keywords).toBe(0);
  });

  it('scores 0 for Pro when job has no keywords', () => {
    const jobNoKw = { ...jobIT, keywords: [] };
    const result = scoreJob(jobNoKw, profilePro, NOW);
    expect(result.breakdown.keywords).toBe(0);
  });

  it('keyword matching is case-insensitive', () => {
    const profileUpperKw = { ...profilePro, keywords: ['JAVASCRIPT', 'REACT'] };
    const result = scoreJob(jobIT, profileUpperKw, NOW);
    expect(result.breakdown.keywords).toBeGreaterThan(0);
  });
});

describe('scoreJob — recency', () => {
  it('scores close to 5 for a job published today', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.recency).toBeCloseTo(5, 0);
  });

  it('scores close to 2.5 for a job published 7 days ago (half-life)', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.recency).toBeCloseTo(2.5, 1);
  });

  it('scores less than 0.5 for a job published 30 days ago', () => {
    const result = scoreJob(jobOld, profileFreemium, NOW);
    expect(result.breakdown.recency).toBeLessThan(0.5);
    expect(result.breakdown.recency).toBeGreaterThanOrEqual(0);
  });

  it('scores 5 for a job published in the future (daysSince < 0)', () => {
    const futureJob = { ...jobIT, publishedAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) };
    const result = scoreJob(futureJob, profileFreemium, NOW);
    expect(result.breakdown.recency).toBe(5);
  });

  it('uses current date when now is omitted', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.recency).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.recency).toBeLessThanOrEqual(5);
  });
});

describe('scoreJob — confidence', () => {
  it('scores 5 for confidence=1.0', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.confidence).toBe(5);
  });

  it('scores 4 for confidence=0.8', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.breakdown.confidence).toBeCloseTo(4);
  });
});

describe('scoreJob — sponsored', () => {
  it('scores 5 for sponsored job', () => {
    const result = scoreJob(jobSponsored, profileMaster, NOW);
    expect(result.breakdown.sponsored).toBe(5);
  });

  it('scores 0 for non-sponsored job', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.breakdown.sponsored).toBe(0);
  });
});

describe('scoreJob — isMatchPerfait', () => {
  it('is true when total >= 80', () => {
    const result = scoreJob(jobIT, profileFreemium, NOW);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.isMatchPerfait).toBe(true);
  });

  it('is false when total < 80', () => {
    const result = scoreJob(jobStage, profileFreemium, NOW);
    expect(result.isMatchPerfait).toBe(false);
  });
});

describe('scoreJob — total', () => {
  it('total equals sum of all breakdown components', () => {
    const result = scoreJob(jobIT, profilePro, NOW);
    const { city, sector, level, contractType, keywords, recency, confidence, sponsored } = result.breakdown;
    expect(result.breakdown.total).toBeCloseTo(
      city + sector + level + contractType + keywords + recency + confidence + sponsored,
      5,
    );
    expect(result.score).toBeCloseTo(result.breakdown.total, 5);
  });
});
