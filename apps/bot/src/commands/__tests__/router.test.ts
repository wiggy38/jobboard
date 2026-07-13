import { routeCommand } from '../router';

jest.mock('../../session/state', () => ({ getState: jest.fn().mockResolvedValue(null) }));

jest.mock('../handlers/onboarding', () => ({
  handleOnboarding: jest.fn().mockResolvedValue(undefined),
  startOnboarding: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../handlers/offres',   () => ({ handleOffres:   jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/suite',    () => ({ handleSuite:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/voir',     () => ({ handleVoir:     jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/modifier', () => ({ handleModifier: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/premium',  () => ({ handlePremium:  jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/parrainer',() => ({ handleParrainer:jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/essai',    () => ({ handleEssai:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/pause',    () => ({ handlePause:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/stop',     () => ({ handleStop:     jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/aide',     () => ({ handleAide:     jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/stats',    () => ({ handleStats:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../handlers/unknown',  () => ({ handleUnknown:  jest.fn().mockResolvedValue(undefined) }));

const { getState } = require('../../session/state');
const { handleOnboarding, startOnboarding } = require('../handlers/onboarding');
const { handleOffres }   = require('../handlers/offres');
const { handleVoir }     = require('../handlers/voir');
const { handlePremium }  = require('../handlers/premium');
const { handleStop }     = require('../handlers/stop');
const { handleAide }     = require('../handlers/aide');
const { handleStats }    = require('../handlers/stats');
const { handleUnknown }  = require('../handlers/unknown');
const { handlePause }    = require('../handlers/pause');
const { handleSuite }    = require('../handlers/suite');

const USER = '+22670000001';
const cmd  = (command: string, raw = command) => ({ userId: USER, command, raw });
const db   = (exists = true) => ({
  user: { findUnique: jest.fn().mockResolvedValue(exists ? { id: 'uuid-1' } : null) },
} as any);

beforeEach(() => { jest.clearAllMocks(); getState.mockResolvedValue(null); });

describe('routeCommand — flux session actif', () => {
  it('état ONBOARDING_CITY → handleOnboarding (sans passer par findUnique)', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: {} });
    const mockDb = db();
    await routeCommand(cmd('OFFRES'), mockDb);
    expect(handleOnboarding).toHaveBeenCalled();
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it('état ONBOARDING_SECTOR → handleOnboarding', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_SECTOR', data: { city: 'Ouaga' } });
    await routeCommand(cmd('FINANCE'), db());
    expect(handleOnboarding).toHaveBeenCalled();
  });

  it('état ONBOARDING_CONTRACT → handleOnboarding', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CONTRACT', data: { city: 'Ouaga', sector: 'IT' } });
    await routeCommand(cmd('CONTRACT_CDI'), db());
    expect(handleOnboarding).toHaveBeenCalled();
  });

  it('état PREMIUM_CHOICE → handlePremium', async () => {
    getState.mockResolvedValue({ step: 'PREMIUM_CHOICE', data: {} });
    await routeCommand(cmd('OFFRES'), db());
    expect(handlePremium).toHaveBeenCalled();
    expect(handleOnboarding).not.toHaveBeenCalled();
  });
});

describe('routeCommand — nouvel utilisateur', () => {
  it('user absent de la DB → startOnboarding', async () => {
    await routeCommand(cmd('OFFRES'), db(false));
    expect(startOnboarding).toHaveBeenCalled();
    expect(handleOffres).not.toHaveBeenCalled();
  });
});

describe('routeCommand — routage normal', () => {
  it('OFFRES → handleOffres', async () => {
    await routeCommand(cmd('OFFRES'), db());
    expect(handleOffres).toHaveBeenCalledWith(expect.objectContaining({ command: 'OFFRES' }), expect.anything());
  });

  it('VOIR → handleVoir', async () => {
    await routeCommand(cmd('VOIR'), db());
    expect(handleVoir).toHaveBeenCalled();
  });

  it('"VOIR 3" → handleVoir (premier token)', async () => {
    await routeCommand(cmd('VOIR 3'), db());
    expect(handleVoir).toHaveBeenCalled();
  });

  it('SUITE → handleSuite', async () => {
    await routeCommand(cmd('SUITE'), db());
    expect(handleSuite).toHaveBeenCalled();
  });

  it('STOP → handleStop', async () => {
    await routeCommand(cmd('STOP'), db());
    expect(handleStop).toHaveBeenCalled();
  });

  it('AIDE → handleAide', async () => {
    await routeCommand(cmd('AIDE'), db());
    expect(handleAide).toHaveBeenCalled();
  });

  it('STATS → handleStats', async () => {
    await routeCommand(cmd('STATS'), db());
    expect(handleStats).toHaveBeenCalled();
  });

  it('PREMIUM → handlePremium', async () => {
    await routeCommand(cmd('PREMIUM'), db());
    expect(handlePremium).toHaveBeenCalled();
  });

  it('SUBSCRIBE (bouton abonnement) → handlePremium', async () => {
    await routeCommand(cmd('SUBSCRIBE'), db());
    expect(handlePremium).toHaveBeenCalled();
  });

  it('PAUSE → handlePause', async () => {
    await routeCommand(cmd('PAUSE'), db());
    expect(handlePause).toHaveBeenCalled();
  });

  it('commande inconnue → handleUnknown', async () => {
    await routeCommand(cmd('FOOBAR'), db());
    expect(handleUnknown).toHaveBeenCalled();
  });

  it('commande vide → handleUnknown', async () => {
    await routeCommand(cmd(''), db());
    expect(handleUnknown).toHaveBeenCalled();
  });
});
