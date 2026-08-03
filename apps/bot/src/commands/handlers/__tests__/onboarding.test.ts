import { startOnboarding } from '../onboarding';

jest.mock('../../../services/whatsapp', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
  sendInteractiveCtaUrl: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/window', () => ({
  openWindow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/pagination', () => ({
  resetOffset: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/tokenService', () => ({
  generateSubscribeToken: jest.fn().mockReturnValue('mock-token'),
  buildSubscribeUrl: jest.fn().mockReturnValue('https://tumaa.bf/subscribe?t=mock-token'),
}));

const { sendText, sendInteractiveCtaUrl } = require('../../../services/whatsapp');
const { openWindow } = require('../../../session/window');
const { resetOffset } = require('../../../session/pagination');
const { generateSubscribeToken, buildSubscribeUrl } = require('../../../services/tokenService');

const USER = '+22670000001';
const cmd = (command: string, raw = command) => ({ userId: USER, command, raw });
const db = () =>
  ({ user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) } } as any);

beforeEach(() => jest.clearAllMocks());

describe('startOnboarding', () => {
  it('envoie un message de bienvenue mentionnant le choix de formule', async () => {
    await startOnboarding(cmd(''), db());
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('formule'));
  });

  it('crée le user + profile FREEMIUM avec villes/secteurs/contrats vides', async () => {
    const mockDb = db();
    await startOnboarding(cmd(''), mockDb);
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: USER },
        create: expect.objectContaining({
          phone: USER,
          plan: 'FREEMIUM',
          status: 'ACTIVE',
          profile: expect.objectContaining({
            create: expect.objectContaining({
              cities: [],
              sectors: [],
              contractTypes: [],
              maxCities: 1,
              maxSectors: 1,
              maxContractGroups: 1,
              maxCountries: 1,
              keywordAlertsEnabled: false,
            }),
          }),
        }),
      }),
    );
  });

  it('ouvre la fenêtre de service et remet l\'offset à zéro', async () => {
    await startOnboarding(cmd(''), db());
    expect(openWindow).toHaveBeenCalledWith(USER);
    expect(resetOffset).toHaveBeenCalledWith(USER);
  });

  it('envoie le CTA vers /subscribe avec un token généré pour le nouvel utilisateur', async () => {
    const mockDb = db();
    await startOnboarding(cmd(''), mockDb);
    expect(generateSubscribeToken).toHaveBeenCalledWith('user-1');
    expect(sendInteractiveCtaUrl).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      expect.any(String),
      buildSubscribeUrl('mock-token'),
    );
  });
});
