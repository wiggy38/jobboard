import { buildChannelTeaser, postDailyChannelTeasers } from '../channelTeaser';

jest.mock('../whatsapp', () => ({
  postToChannel: jest.fn().mockResolvedValue(undefined),
}));

const { postToChannel } = require('../whatsapp');

function makeOffer(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: 'Développeur Web',
    organization: 'ACME Corp',
    city: 'Ouagadougou',
    isFeatured: false,
    isSponsored: false,
    publishedAt: new Date('2026-06-01'),
    ...overrides,
  };
}

function makeDb(offers: ReturnType<typeof makeOffer>[] = []) {
  return {
    jobOffer: { findMany: jest.fn().mockResolvedValue(offers) },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TOKEN_SECRET = 'test-secret';
  process.env.WEB_BASE_URL = 'https://tumaa.bf';
  delete process.env.CHANNEL_ID_BF;
  delete process.env.CHANNEL_ID_BJ;
  delete process.env.CHANNEL_ID_TG;
  delete process.env.CHANNEL_ID_CI;
});

describe('buildChannelTeaser', () => {
  it('retourne null si aucune offre active pour le pays', async () => {
    const db = makeDb([]);
    const teaser = await buildChannelTeaser(db, 'BF');
    expect(teaser).toBeNull();
  });

  it('inclut le titre, la ville et un lien wa.me pour chaque offre', async () => {
    const db = makeDb([makeOffer('o1')]);
    const teaser = await buildChannelTeaser(db, 'BF');
    expect(teaser).toContain('Développeur Web');
    expect(teaser).toContain('Ouagadougou');
    expect(teaser).toContain('https://tumaa.bf/offre/o1');
  });

  it('filtre sur ACTIVE + country et trie isFeatured/isSponsored en premier', async () => {
    const db = makeDb([makeOffer('o1')]);
    await buildChannelTeaser(db, 'BF');
    expect(db.jobOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', country: 'BF' },
        orderBy: [{ isFeatured: 'desc' }, { isSponsored: 'desc' }, { publishedAt: 'desc' }],
      }),
    );
  });
});

describe('postDailyChannelTeasers', () => {
  it('ignore un pays sans CHANNEL_ID configuré', async () => {
    const db = makeDb([makeOffer('o1')]);
    const results = await postDailyChannelTeasers(db);
    expect(results.every((r) => !r.posted)).toBe(true);
    expect(postToChannel).not.toHaveBeenCalled();
  });

  it('poste le teaser pour un pays dont le CHANNEL_ID est configuré et des offres actives', async () => {
    process.env.CHANNEL_ID_BF = 'channel-bf-id';
    const db = makeDb([makeOffer('o1')]);
    const results = await postDailyChannelTeasers(db);

    expect(postToChannel).toHaveBeenCalledWith('channel-bf-id', expect.stringContaining('Développeur Web'));
    const bfResult = results.find((r) => r.country === 'BF');
    expect(bfResult?.posted).toBe(true);
  });

  it('signale l\'absence d\'offre active même si CHANNEL_ID est configuré', async () => {
    process.env.CHANNEL_ID_BF = 'channel-bf-id';
    const db = makeDb([]);
    const results = await postDailyChannelTeasers(db);

    expect(postToChannel).not.toHaveBeenCalled();
    const bfResult = results.find((r) => r.country === 'BF');
    expect(bfResult?.posted).toBe(false);
    expect(bfResult?.reason).toMatch(/offre/i);
  });
});
