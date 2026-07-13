import { JobOffer, ContractType } from '../../src/types';

const NOW = new Date('2026-06-24T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

export { NOW };

export const jobIT: JobOffer = {
  id: 'job-1',
  title: 'Développeur Full Stack',
  organization: 'Tech Burkina',
  city: 'Ouagadougou',
  sector: 'Informatique',
  level: 'Licence',
  contractType: ContractType.CDI,
  keywords: ['javascript', 'react', 'node'],
  publishedAt: days(0),
  scoreConfidence: 1.0,
  isSponsored: false,
};

export const jobStage: JobOffer = {
  id: 'job-2',
  title: 'Stage comptabilité',
  organization: 'Cabinet Fiduciaire',
  city: 'Bobo-Dioulasso',
  sector: 'Finance',
  level: 'BAC+2',
  contractType: ContractType.STAGE,
  keywords: ['comptabilité', 'excel'],
  publishedAt: days(7),
  scoreConfidence: 0.8,
  isSponsored: false,
};

export const jobSponsored: JobOffer = {
  id: 'job-3',
  title: 'Chef de projet',
  organization: 'ONG Sahel',
  city: 'Ouagadougou',
  sector: 'Humanitaire',
  level: 'Master',
  contractType: ContractType.CDI,
  keywords: ['gestion', 'projet', 'terrain'],
  publishedAt: days(2),
  scoreConfidence: 0.9,
  isSponsored: true,
};

export const jobOld: JobOffer = {
  id: 'job-4',
  title: 'Assistant RH',
  organization: 'Société Générale BF',
  city: 'Ouagadougou',
  sector: 'RH',
  level: 'BAC+3',
  contractType: ContractType.CDD,
  keywords: ['recrutement', 'paie'],
  publishedAt: days(30),
  scoreConfidence: 0.6,
  isSponsored: false,
};
