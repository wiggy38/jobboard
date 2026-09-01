import { handleOffres } from '../offres';

jest.mock('../../../services/pull', () => ({
  getUserWithProfile: jest.fn(),
  upsertUser: jest.fn().mockResolvedValue(undefined),
  recordPullEvent: jest.fn().mockResolvedValue(undefined),
  recordPullDelivery: jest.fn().mockResolvedValue(undefined),
  hasZeroOfferStreak: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../session/pagination', () => ({
  resetOffset: jest.fn().mockResolvedValue(undefined),
  setOffset: jest.fn().mockResolvedValue(undefined),
  getOffset: jest.fn().mockResolvedValue(0),
  getPullBatchSize: jest.fn().mockResolvedValue(10),
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

jest.mock('../../../services/whatsapp', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@tumaa/matching', () => ({
  matchJobsAboveThreshold: jest.fn((offers: { id: string }[]) =>
    offers.map((o) => ({ jobId: o.id, score: 1 })),
  ),
  UserPlan: { FREEMIUM: 'FREEMIUM', PREMIUM: 'PREMIUM' },
  ContractType: {},
}));

const { getUserWithProfile, recordPullEvent, recordPullDelivery, hasZeroOfferStreak } = require('../../../services/pull');
const { resetOffset, setOffset } = require('../../../session/pagination');
const { openWindow } = require('../../../session/window');
const { deliverJobsBatch } = require('../../../messages/delivery');
const { sendMessage } = require('../../../whatsapp/client');
const { sendText } = require('../../../services/whatsapp');

const USER = '+22670000001';
const cmd = () => ({ userId: USER, command: 'OFFRES', raw: 'offres' });

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
});

// ── Onboarding ────────────────────────────────────────────────────────────────

describe('handleOffres — onboarding nouvel utilisateur', () => {
  it('getUserWithProfile null → message de bienvenue envoyé via sendText', async () => {
    getUserWithProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(FREEMIUM_USER);
    await handleOffres(cmd(), makeDb());
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('Bienvenue'), undefined);
  });

  it('getUserWithProfile appelé une 2e fois après onboarding pour récupérer le profil créé', async () => {
    getUserWithProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(FREEMIUM_USER);
    await handleOffres(cmd(), makeDb());
    expect(getUserWithProfile).toHaveBeenCalledTimes(2);
  });

  it('double null (upsert échoue silencieusement) → retour sans crash ni livraison', async () => {
    getUserWithProfile.mockResolvedValue(null);
    await expect(handleOffres(cmd(), makeDb())).resolves.toBeUndefined();
    expect(deliverJobsBatch).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('handleOffres — pagination', () => {
  it('reset l\'offset à 0 à chaque appel OFFRES (pas de reprise depuis SUITE)', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(resetOffset).toHaveBeenCalledWith(USER);
  });

  it('met l\'offset à 10 après livraison du premier lot', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(setOffset).toHaveBeenCalledWith(USER, 10);
  });

  it('le batch livré est limité aux 10 premières offres ordonnées', async () => {
    const offers = Array.from({ length: 15 }, (_, i) => makeOffer(`o${i}`));
    await handleOffres(cmd(), makeDb(offers));
    const [, , batch] = deliverJobsBatch.mock.calls[0];
    expect(batch).toHaveLength(10);
  });

  it('n\'appelle pas setOffset si aucune offre disponible', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(setOffset).not.toHaveBeenCalled();
  });
});

// ── Livraison des offres ──────────────────────────────────────────────────────

describe('handleOffres — livraison', () => {
  it('aucune offre active → sendMessage formatNoOffersToday, pas de deliverJobsBatch', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(sendMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ type: 'text' }), undefined);
    expect(deliverJobsBatch).not.toHaveBeenCalled();
  });

  it('aucune offre active → vérifie le streak de jours sans offre', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(hasZeroOfferStreak).toHaveBeenCalledWith(FREEMIUM_USER.id, 4);
  });

  it('des offres disponibles → deliverJobsBatch avec userId et plan FREEMIUM', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(deliverJobsBatch).toHaveBeenCalledWith(
      USER,
      FREEMIUM_USER.id,
      expect.any(Array),
      'FREEMIUM',
      expect.any(Function),
      undefined,
      undefined,
    );
  });

  it('utilisateur PREMIUM → deliverJobsBatch avec plan PREMIUM', async () => {
    getUserWithProfile.mockResolvedValue({ ...FREEMIUM_USER, plan: 'PREMIUM' });
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    const [, , , planArg] = deliverJobsBatch.mock.calls[0];
    expect(planArg).toBe('PREMIUM');
  });

  it('profil null → matching fonctionne avec des critères vides (pas de crash)', async () => {
    getUserWithProfile.mockResolvedValue({ ...FREEMIUM_USER, profile: null });
    await expect(
      handleOffres(cmd(), makeDb([makeOffer('o1')])),
    ).resolves.toBeUndefined();
    expect(deliverJobsBatch).toHaveBeenCalled();
  });
});

// ── Fenêtre de service ────────────────────────────────────────────────────────

describe('handleOffres — fenêtre de service (TTL 24h)', () => {
  it('ouvre la fenêtre après livraison d\'offres', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(openWindow).toHaveBeenCalledWith(USER);
  });

  it('ouvre la fenêtre même quand aucune offre n\'est disponible', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(openWindow).toHaveBeenCalledWith(USER);
  });
});

// ── Événement pull ────────────────────────────────────────────────────────────

describe('handleOffres — recordPullEvent (boucle pull gratuite)', () => {
  it('appelé avec l\'id interne du user (pas le numéro de téléphone) et le nombre d\'offres livrées', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(recordPullEvent).toHaveBeenCalledWith(FREEMIUM_USER.id, 1);
  });

  it('appelé même quand aucune offre ne correspond au profil, avec un compte à 0', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(recordPullEvent).toHaveBeenCalledWith(FREEMIUM_USER.id, 0);
  });
});

describe('handleOffres — recordPullDelivery (historique détaillé)', () => {
  it('enregistre la commande OFFRES avec les ids des offres livrées', async () => {
    await handleOffres(cmd(), makeDb([makeOffer('o1')]));
    expect(recordPullDelivery).toHaveBeenCalledWith(FREEMIUM_USER.id, 'OFFRES', ['o1'], 'FREEMIUM');
  });

  it('enregistre une liste vide quand aucune offre ne correspond au profil', async () => {
    await handleOffres(cmd(), makeDb([]));
    expect(recordPullDelivery).toHaveBeenCalledWith(FREEMIUM_USER.id, 'OFFRES', [], 'FREEMIUM');
  });
});
