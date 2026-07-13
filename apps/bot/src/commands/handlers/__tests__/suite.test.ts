import { handleSuite } from '../suite';

jest.mock('../../../services/pull', () => ({
  getUserWithProfile: jest.fn(),
  recordPullEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/pagination', () => ({
  getOffset: jest.fn().mockResolvedValue(0),
  setOffset: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/window', () => ({
  openWindow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../messages/delivery', () => ({
  deliverJobsBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../whatsapp/client', () => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@tumaa/matching', () => ({
  matchJobsAboveThreshold: jest.fn((offers: { id: string }[]) =>
    offers.map((o) => ({ jobId: o.id, score: 1 })),
  ),
  UserPlan: { FREEMIUM: 'FREEMIUM', PREMIUM: 'PREMIUM' },
  ContractType: {},
}));

const { getUserWithProfile, recordPullEvent } = require('../../../services/pull');
const { getOffset, setOffset } = require('../../../session/pagination');
const { openWindow } = require('../../../session/window');
const { deliverJobsBatch } = require('../../../messages/delivery');
const { sendMessage } = require('../../../whatsapp/client');

const USER = '+22670000001';
const cmd = () => ({ userId: USER, command: 'SUITE', raw: 'suite' });

const FREEMIUM_USER = {
  id: 'user-uuid-1',
  plan: 'FREEMIUM',
  status: 'ACTIVE',
  profile: {
    cities: ['Ouagadougou'],
    sectors: ['IT'],
    levels: [],
    contractTypes: ['CDI'],
    keywords: [],
    notificationTime: '08:00',
    language: 'fr',
  },
};

function makeOffer(id: string) {
  return {
    id,
    title: 'Développeur Web',
    organization: 'ACME Corp',
    city: 'Ouagadougou',
    sector: 'IT',
    level: 'Junior',
    contractType: 'CDI',
    description: null,
    requirements: null,
    contactEmail: null,
    contactPhone: null,
    contactAddress: null,
    applicationUrl: 'https://example.com',
    sourceId: 'src-1',
    sourceUrl: 'https://lefaso.net',
    isSponsored: false,
    hash: `hash-${id}`,
    publishedAt: new Date('2026-06-01'),
    deadline: new Date('2026-07-01'),
    status: 'ACTIVE',
    validated: false,
    ttlDays: 30,
    scoreConfidence: 0.8,
    isFraudSuspect: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDb(offers: ReturnType<typeof makeOffer>[] = []) {
  return {
    jobOffer: { findMany: jest.fn().mockResolvedValue(offers) },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  getUserWithProfile.mockResolvedValue(FREEMIUM_USER);
  getOffset.mockResolvedValue(0);
});

// ── Garde-fou utilisateur inconnu ─────────────────────────────────────────────

describe('handleSuite — utilisateur inconnu', () => {
  it('getUserWithProfile null → retour silencieux sans livraison ni crash', async () => {
    getUserWithProfile.mockResolvedValue(null);
    await expect(handleSuite(cmd(), makeDb())).resolves.toBeUndefined();
    expect(deliverJobsBatch).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ── Continuation de la pagination ─────────────────────────────────────────────

describe('handleSuite — reprise depuis l\'offset stocké', () => {
  it('offset 5 → le batch commence à l\'offre 6 (slice de 5 à 10)', async () => {
    getOffset.mockResolvedValue(5);
    const offers = Array.from({ length: 10 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    const [, , batch] = deliverJobsBatch.mock.calls[0];
    expect(batch).toHaveLength(5);
    expect(batch[0].id).toBe('o5');
  });

  it('ne remet jamais l\'offset à 0 (contrairement à OFFRES)', async () => {
    getOffset.mockResolvedValue(5);
    const offers = Array.from({ length: 10 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    // setOffset doit être appelé avec 10, pas réinitialisé à 0
    expect(setOffset).toHaveBeenCalledWith(USER, 10);
    expect(setOffset).not.toHaveBeenCalledWith(USER, 0);
  });

  it('avance l\'offset de 5 après chaque SUITE', async () => {
    getOffset.mockResolvedValue(5);
    const offers = Array.from({ length: 12 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(setOffset).toHaveBeenCalledWith(USER, 10);
  });
});

// ── Fin de liste ──────────────────────────────────────────────────────────────

describe('handleSuite — fin de liste', () => {
  it('offset ≥ nombre total d\'offres → sendMessage formatNoMoreOffers', async () => {
    getOffset.mockResolvedValue(5);
    const offers = Array.from({ length: 5 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(sendMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ type: 'text' }));
    expect(deliverJobsBatch).not.toHaveBeenCalled();
  });

  it('aucune offre du tout → sendMessage formatNoMoreOffers', async () => {
    getOffset.mockResolvedValue(0);
    await handleSuite(cmd(), makeDb([]));
    expect(sendMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ type: 'text' }));
  });

  it('fin de liste → pas de setOffset (pas d\'avancement inutile)', async () => {
    getOffset.mockResolvedValue(10);
    const offers = Array.from({ length: 5 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(setOffset).not.toHaveBeenCalled();
  });

  it('fin de liste → ni openWindow ni recordPullEvent (retour anticipé)', async () => {
    getOffset.mockResolvedValue(10);
    await handleSuite(cmd(), makeDb([]));
    expect(openWindow).not.toHaveBeenCalled();
    expect(recordPullEvent).not.toHaveBeenCalled();
  });
});

// ── Livraison ─────────────────────────────────────────────────────────────────

describe('handleSuite — livraison', () => {
  it('livraison avec le plan de l\'utilisateur', async () => {
    const offers = Array.from({ length: 6 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(deliverJobsBatch).toHaveBeenCalledWith(
      USER,
      FREEMIUM_USER.id,
      expect.any(Array),
      'FREEMIUM',
      expect.any(Function),
    );
  });

  it('utilisateur PREMIUM → plan PREMIUM transmis à deliverJobsBatch', async () => {
    getUserWithProfile.mockResolvedValue({ ...FREEMIUM_USER, plan: 'PREMIUM' });
    const offers = Array.from({ length: 6 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    const [, , , planArg] = deliverJobsBatch.mock.calls[0];
    expect(planArg).toBe('PREMIUM');
  });

  it('batch limité à 5 même si l\'offset laisse plus d\'offres disponibles', async () => {
    getOffset.mockResolvedValue(0);
    const offers = Array.from({ length: 12 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    const [, , batch] = deliverJobsBatch.mock.calls[0];
    expect(batch).toHaveLength(5);
  });
});

// ── Fenêtre de service ────────────────────────────────────────────────────────

describe('handleSuite — fenêtre de service', () => {
  it('ouvre la fenêtre après livraison réussie', async () => {
    const offers = Array.from({ length: 6 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(openWindow).toHaveBeenCalledWith(USER);
  });
});

// ── Événement pull ────────────────────────────────────────────────────────────

describe('handleSuite — recordPullEvent', () => {
  it('appelé avec l\'id interne du user après livraison', async () => {
    const offers = Array.from({ length: 6 }, (_, i) => makeOffer(`o${i}`));
    await handleSuite(cmd(), makeDb(offers));
    expect(recordPullEvent).toHaveBeenCalledWith(FREEMIUM_USER.id);
  });
});
