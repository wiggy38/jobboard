import { scoreJob } from '../src/scorer';
import { EDUCATION_HIERARCHY } from '../src/types';
import { jobIT, jobStage, jobSponsored } from './fixtures/jobs';
import { profileFreemium, profileEssentiel } from './fixtures/profiles';

describe('scoreJob — city', () => {
  it('scores 35 when city matches', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.city).toBe(35);
  });

  it('scores 0 when city does not match', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.breakdown.city).toBe(0);
  });
});

describe('scoreJob — sector', () => {
  it('scores 30 when sector matches', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.sector).toBe(30);
  });

  it('scores 0 when sector does not match', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.breakdown.sector).toBe(0);
  });
});

// profile.levels représente le niveau d'études MAXIMUM recherché par l'utilisateur.
// Le score dépend de la fenêtre de correspondance LEVEL_MATCH_WINDOWS associée à ce
// niveau max (voir packages/matching/src/types.ts) : exact = 15, puis score dégressif
// pour les niveaux d'offre inférieurs listés dans la fenêtre, 0 en dehors.
describe('scoreJob — level', () => {
  it('scores 15 for exact level match', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.level).toBe(15);
  });

  it('scores 15 when job level equals the profile max level', () => {
    const result = scoreJob(jobStage, profileEssentiel);
    expect(result.breakdown.level).toBe(15);
  });

  it('scores 12 when job level is one step below the profile max level (BAC+2 vs Licence)', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.breakdown.level).toBe(12);
  });

  it('scores 0 when job level is above the profile max level (Master vs Licence)', () => {
    const result = scoreJob(jobSponsored, profileFreemium);
    expect(result.breakdown.level).toBe(0);
  });

  it('scores 0 when level is unknown', () => {
    const unknownJob = { ...jobIT, level: 'Inconnu' };
    const result = scoreJob(unknownJob, profileFreemium);
    expect(result.breakdown.level).toBe(0);
  });

  it('scores 0 when all profile levels are unknown/unmapped', () => {
    const profileUnknownLevels = { ...profileFreemium, levels: ['NiveauInconnu'] };
    const result = scoreJob(jobIT, profileUnknownLevels);
    expect(result.breakdown.level).toBe(0);
  });

  it('uses the max rank among multiple profile levels to pick the window', () => {
    const lRank = EDUCATION_HIERARCHY['Licence'];
    const mRank = EDUCATION_HIERARCHY['Master'];
    expect(mRank).toBeGreaterThan(lRank);

    const profileMulti = { ...profileFreemium, levels: ['Licence', 'Master'] };
    const result = scoreJob(jobIT, profileMulti); // jobIT.level === 'Licence', profile max === Master
    expect(result.breakdown.level).toBe(12); // Licence is one step below Master in Master's window
  });

  it('BAC window reaches down to CEP with no gap', () => {
    const profileBac = { ...profileFreemium, levels: ['BAC'] };
    expect(scoreJob({ ...jobIT, level: 'BEPC' }, profileBac).breakdown.level).toBe(12);
    expect(scoreJob({ ...jobIT, level: 'CEP' }, profileBac).breakdown.level).toBe(10);
    expect(scoreJob({ ...jobIT, level: 'Sans diplôme' }, profileBac).breakdown.level).toBe(8);
  });

  it('BAC+1 window deliberately skips Sans diplôme', () => {
    const profileBac1 = { ...profileFreemium, levels: ['BAC+1'] };
    expect(scoreJob({ ...jobIT, level: 'CEP' }, profileBac1).breakdown.level).toBe(8);
    expect(scoreJob({ ...jobIT, level: 'Sans diplôme' }, profileBac1).breakdown.level).toBe(0);
  });

  it('Doctorat window stops at BAC+2 (does not reach BAC+1)', () => {
    const profileDoctorat = { ...profileFreemium, levels: ['Doctorat'] };
    expect(scoreJob({ ...jobIT, level: 'BAC+2' }, profileDoctorat).breakdown.level).toBe(8);
    expect(scoreJob({ ...jobIT, level: 'BAC+1' }, profileDoctorat).breakdown.level).toBe(0);
  });

  it('resolves job-side synonyms to their canonical level (BTS/DUT/BAC+3/BAC+5/DEA/DESS/PhD)', () => {
    const profileLicence = { ...profileFreemium, levels: ['Licence'] };
    expect(scoreJob({ ...jobIT, level: 'BTS' }, profileLicence).breakdown.level).toBe(12);
    expect(scoreJob({ ...jobIT, level: 'DUT' }, profileLicence).breakdown.level).toBe(12);

    const profileMaster = { ...profileFreemium, levels: ['Master'] };
    expect(scoreJob({ ...jobIT, level: 'BAC+3' }, profileMaster).breakdown.level).toBe(12);

    const profileDoctorat = { ...profileFreemium, levels: ['Doctorat'] };
    expect(scoreJob({ ...jobIT, level: 'BAC+5' }, profileDoctorat).breakdown.level).toBe(12);
    expect(scoreJob({ ...jobIT, level: 'DEA' }, profileDoctorat).breakdown.level).toBe(12);
    expect(scoreJob({ ...jobIT, level: 'DESS' }, profileDoctorat).breakdown.level).toBe(12);
    expect(scoreJob({ ...jobIT, level: 'PhD' }, profileDoctorat).breakdown.level).toBe(15);
  });

  it('resolves profile-side synonym levels the same way (BTS profile behaves like BAC+2)', () => {
    const profileBts = { ...profileFreemium, levels: ['BTS'] };
    const result = scoreJob({ ...jobIT, level: 'BAC+1' }, profileBts);
    expect(result.breakdown.level).toBe(12);
  });

  it('scores 0 for BAC+4, which has no equivalent in any profile window', () => {
    const profileMaster = { ...profileFreemium, levels: ['Master'] };
    const result = scoreJob({ ...jobIT, level: 'BAC+4' }, profileMaster);
    expect(result.breakdown.level).toBe(0);
  });
});

describe('scoreJob — contractType', () => {
  it('scores 10 when contract type matches', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.contractType).toBe(10);
  });

  it('scores 0 when contract type does not match', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.breakdown.contractType).toBe(0);
  });
});

describe('scoreJob — confidence', () => {
  it('scores 5 for confidence=1.0', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.confidence).toBe(5);
  });

  it('scores 4 for confidence=0.8', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.breakdown.confidence).toBeCloseTo(4);
  });
});

describe('scoreJob — sponsored', () => {
  it('scores 5 for sponsored job', () => {
    const result = scoreJob(jobSponsored, profileFreemium);
    expect(result.breakdown.sponsored).toBe(5);
  });

  it('scores 0 for non-sponsored job', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.breakdown.sponsored).toBe(0);
  });
});

describe('scoreJob — isMatchPerfait', () => {
  it('is true when total >= 80', () => {
    const result = scoreJob(jobIT, profileFreemium);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.isMatchPerfait).toBe(true);
  });

  it('is false when total < 80', () => {
    const result = scoreJob(jobStage, profileFreemium);
    expect(result.isMatchPerfait).toBe(false);
  });
});

describe('scoreJob — total', () => {
  it('total equals sum of all breakdown components', () => {
    const result = scoreJob(jobIT, profileFreemium);
    const { city, sector, level, contractType, confidence, sponsored, featured } = result.breakdown;
    expect(result.breakdown.total).toBeCloseTo(
      city + sector + level + contractType + confidence + sponsored + featured,
      5,
    );
    expect(result.score).toBeCloseTo(result.breakdown.total, 5);
  });
});
