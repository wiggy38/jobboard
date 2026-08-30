import { postDailyDigests } from '../dailyDigest';
import { DIGEST_CTA_TEMPLATES } from '../../messages/digestPhrases';

jest.mock('../matching', () => ({ getMatchedOffers: jest.fn() }));
jest.mock('../pull', () => ({ recordPullDelivery: jest.fn() }));
jest.mock('../templateGate', () => ({ sendPaidTemplate: jest.fn() }));

const { getMatchedOffers } = require('../matching');
const { recordPullDelivery } = require('../pull');
const { sendPaidTemplate } = require('../templateGate');

function makeOffer(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: 'Développeur Web',
    city: 'Ouagadougou',
    contractType: 'CDI',
    ...overrides,
  };
}

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    phone: '+22670000001',
    plan: 'PREMIUM',
    countries: ['BF'],
    profile: { cities: [], sectors: [], levels: [], contractTypes: [], keywords: [] },
    ...overrides,
  };
}

function makeDb(users: ReturnType<typeof makeUser>[]) {
  return {
    user: { findMany: jest.fn().mockResolvedValue(users) },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  process.env.TOKEN_SECRET = 'test-secret';
  process.env.WEB_BASE_URL = 'https://tumaa.bf';
  sendPaidTemplate.mockResolvedValue({ sent: true });
  recordPullDelivery.mockResolvedValue({ id: 'delivery-1' });
});

afterEach(() => {
  jest.useRealTimers();
});

async function run(db: any): Promise<Awaited<ReturnType<typeof postDailyDigests>>> {
  const promise = postDailyDigests(db);
  await jest.runAllTimersAsync();
  return promise;
}

describe('postDailyDigests', () => {
  it('ne cible que les users PREMIUM/ELITE actifs', async () => {
    const db = makeDb([]);
    await run(db);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plan: { in: ['PREMIUM', 'ELITE'] }, status: 'ACTIVE' },
      }),
    );
  });

  it('skip un user sans offre correspondante, sans appeler sendPaidTemplate ni recordPullDelivery', async () => {
    getMatchedOffers.mockResolvedValueOnce([]);
    const db = makeDb([makeUser()]);

    const result = await run(db);

    expect(sendPaidTemplate).not.toHaveBeenCalled();
    expect(recordPullDelivery).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 1, blocked: 0 });
  });

  it('enregistre le PullDelivery AVANT l\'envoi, puis notifie avec 2 paramètres de corps + un bouton URL vers /digest/', async () => {
    getMatchedOffers.mockResolvedValueOnce([makeOffer('o1'), makeOffer('o2')]);
    const db = makeDb([makeUser()]);

    const result = await run(db);

    expect(recordPullDelivery).toHaveBeenCalledWith('user-1', 'DAILY_DIGEST', ['o1', 'o2'], 'PREMIUM');

    expect(sendPaidTemplate).toHaveBeenCalledWith(
      '+22670000001',
      'user-1',
      'DAILY_DIGEST',
      'daily_digest_fr',
      expect.any(Array),
      'BF',
    );

    const components = sendPaidTemplate.mock.calls[0][4];
    const [bodyComponent, buttonComponent] = components;

    expect(bodyComponent.type).toBe('body');
    expect(bodyComponent.parameters).toHaveLength(2);
    // {{1}} — formulation tirée au hasard, contient toujours le nombre d'offres.
    expect(bodyComponent.parameters[0].text).toContain('2');
    expect(bodyComponent.parameters[0].text).not.toContain('Développeur Web');
    // {{2}} — incitation tirée au hasard dans le pool connu.
    expect(DIGEST_CTA_TEMPLATES).toContain(bodyComponent.parameters[1].text);

    expect(buttonComponent.type).toBe('button');
    expect(buttonComponent.sub_type).toBe('url');
    expect(buttonComponent.index).toBe('0');

    const suffix = buttonComponent.parameters[0].text;
    // Suffixe dynamique uniquement — pas de domaine, celui-ci est fixé côté
    // config du bouton dans Meta Business Manager.
    expect(suffix).toMatch(/^delivery-1\?t=/);
    expect(suffix).not.toContain('https://');
    expect(suffix).not.toContain('Développeur Web');

    expect(result).toEqual({ sent: 1, skipped: 0, blocked: 0 });
  });

  it('le paramètre {{1}} contient bien le nombre même avec une seule offre', async () => {
    getMatchedOffers.mockResolvedValueOnce([makeOffer('o1')]);
    const db = makeDb([makeUser()]);

    await run(db);

    const [bodyComponent] = sendPaidTemplate.mock.calls[0][4];
    expect(bodyComponent.parameters[0].text).toContain('1');
  });

  it("compte 'blocked' quand le template est refusé (plafond atteint), le PullDelivery reste tout de même enregistré", async () => {
    getMatchedOffers.mockResolvedValueOnce([makeOffer('o1')]);
    sendPaidTemplate.mockResolvedValueOnce({ sent: false, reason: 'LIMIT_REACHED' });
    const db = makeDb([makeUser()]);

    const result = await run(db);

    expect(recordPullDelivery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, skipped: 0, blocked: 1 });
  });
});
