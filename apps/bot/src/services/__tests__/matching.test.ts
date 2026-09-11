import { getMatchedOffers } from '../matching';
import { UserPlan } from '@prisma/client';

function makeOffer(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: 'Développeur Web',
    organization: 'ACME Corp',
    city: 'Ouagadougou',
    sector: 'Informatique',
    level: 'Licence',
    contractType: 'CDI',
    publishedAt: new Date('2026-06-01'),
    scoreConfidence: 1,
    isSponsored: false,
    isFeatured: false,
    ...overrides,
  };
}

function makeDb(offers: ReturnType<typeof makeOffer>[] = []) {
  return {
    jobOffer: { findMany: jest.fn().mockResolvedValue(offers) },
  } as any;
}

const profile = {
  cities: ['Ouagadougou'],
  sectors: ['Informatique'],
  levels: ['Licence'],
  contractTypes: ['CDI'],
  keywords: [],
};

describe('getMatchedOffers', () => {
  it('filtre la requête DB sur status/country uniquement — ville/secteur restent au scorer', async () => {
    const db = makeDb([makeOffer('o1')]);
    await getMatchedOffers(db, 'user1', UserPlan.FREEMIUM, profile, ['BF']);
    expect(db.jobOffer.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        country: { in: ['BF'] },
      },
    });
  });

  it('retient une offre qui matche ville + secteur', async () => {
    const db = makeDb([makeOffer('o1')]);
    const offers = await getMatchedOffers(db, 'user1', UserPlan.FREEMIUM, profile, ['BF']);
    expect(offers.map((o) => o.id)).toEqual(['o1']);
  });

  it('ne retourne aucune offre si le profil n\'a ni ville ni secteur ni niveau configuré (score sous le seuil)', async () => {
    const db = makeDb([makeOffer('o1')]);
    const emptyProfile = { ...profile, cities: [], sectors: [], levels: [] };
    const offers = await getMatchedOffers(db, 'user1', UserPlan.FREEMIUM, emptyProfile, ['BF']);
    expect(offers).toEqual([]);
  });
});
