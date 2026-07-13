import { UserProfile, ContractType, UserPlan } from '../../src/types';

export const profileFreemium: UserProfile = {
  userId: 'user-freemium',
  cities: ['Ouagadougou'],
  sectors: ['Informatique'],
  levels: ['Licence'],
  contractTypes: [ContractType.CDI],
  keywords: [],
  plan: UserPlan.FREEMIUM,
};

export const profileEssentiel: UserProfile = {
  userId: 'user-essentiel',
  cities: ['Ouagadougou', 'Bobo-Dioulasso'],
  sectors: ['Finance', 'RH'],
  levels: ['BAC+2', 'BTS'],
  contractTypes: [ContractType.STAGE, ContractType.CDD],
  keywords: [],
  plan: UserPlan.PREMIUM,
};

export const profilePro: UserProfile = {
  userId: 'user-pro',
  cities: ['Ouagadougou'],
  sectors: ['Informatique'],
  levels: ['Licence'],
  contractTypes: [ContractType.CDI],
  keywords: ['javascript', 'react'],
  plan: UserPlan.PREMIUM,
};

export const profileMaster: UserProfile = {
  userId: 'user-master',
  cities: ['Ouagadougou'],
  sectors: ['Humanitaire'],
  levels: ['Master'],
  contractTypes: [ContractType.CDI],
  keywords: ['gestion', 'projet'],
  plan: UserPlan.PREMIUM,
};
