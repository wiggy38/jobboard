import { startOnboarding, handleOnboarding } from '../onboarding';

jest.mock('../../../services/whatsapp', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
  sendInteractiveButtons: jest.fn().mockResolvedValue(undefined),
  sendInteractiveList: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/state', () => ({
  getState: jest.fn(),
  setState: jest.fn().mockResolvedValue(undefined),
  clearState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/window', () => ({
  openWindow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../session/pagination', () => ({
  resetOffset: jest.fn().mockResolvedValue(undefined),
}));

// Handlers appelés par interruptions
jest.mock('../aide',    () => ({ handleAide:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../stop',    () => ({ handleStop:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../premium', () => ({ handlePremium: jest.fn().mockResolvedValue(undefined) }));

const { sendText, sendInteractiveButtons, sendInteractiveList } = require('../../../services/whatsapp');
const { getState, setState, clearState }   = require('../../../session/state');
const { openWindow }                       = require('../../../session/window');
const { resetOffset }                      = require('../../../session/pagination');
const { handleAide }                       = require('../aide');
const { handleStop }                       = require('../stop');

const USER = '+22670000001';
const cmd  = (command: string, raw = command) => ({ userId: USER, command, raw });
const db   = () => ({ user: { upsert: jest.fn().mockResolvedValue({}) } } as any);

beforeEach(() => jest.clearAllMocks());

// ─── startOnboarding ─────────────────────────────────────────────────────────

describe('startOnboarding', () => {
  it('envoie un message de bienvenue avec mention de "villes"', async () => {
    await startOnboarding(cmd(''));
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('villes'));
  });

  it('initialise l\'état ONBOARDING_CITY avec cities vide', async () => {
    await startOnboarding(cmd(''));
    expect(setState).toHaveBeenCalledWith(USER, { step: 'ONBOARDING_CITY', data: { cities: [] } });
  });

  it('envoie la liste interactive des villes', async () => {
    await startOnboarding(cmd(''));
    expect(sendInteractiveList).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          rows: expect.arrayContaining([expect.objectContaining({ id: 'city_ouagadougou' })]),
        }),
      ]),
    );
  });
});

// ─── handleOnboarding ────────────────────────────────────────────────────────

describe('handleOnboarding — état absent', () => {
  it('retourne sans rien faire si getState renvoie null', async () => {
    getState.mockResolvedValue(null);
    await handleOnboarding(cmd('OFFRES'), db());
    expect(sendText).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });
});

describe('handleOnboarding — interruptions', () => {
  it('STOP délègue à handleStop depuis n\'importe quelle étape', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: [] } });
    await handleOnboarding(cmd('STOP'), db());
    expect(handleStop).toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it('AIDE appelle handleAide puis re-envoie la liste des villes', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: [] } });
    await handleOnboarding(cmd('AIDE'), db());
    expect(handleAide).toHaveBeenCalled();
    expect(sendInteractiveList).toHaveBeenCalled();
  });

  it('AIDE depuis ONBOARDING_SECTOR re-envoie la liste des secteurs', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 1 },
    });
    await handleOnboarding(cmd('AIDE'), db());
    expect(sendInteractiveList).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          rows: expect.arrayContaining([expect.objectContaining({ id: 'sector_informatique' })]),
        }),
      ]),
    );
  });

  it('AIDE depuis ONBOARDING_CONTRACT re-envoie les boutons de contrat', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_CONTRACT',
      data: { cities: ['Ouagadougou'], sectors: ['Informatique'] },
    });
    await handleOnboarding(cmd('AIDE'), db());
    expect(sendInteractiveButtons).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ id: 'contract_cdi' })]),
    );
  });
});

describe('handleOnboarding — étape ONBOARDING_CITY (choix multiple)', () => {
  it('sélectionner une ville l\'ajoute à la liste et reste sur ONBOARDING_CITY', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: [] } });
    await handleOnboarding(cmd('CITY_OUAGADOUGOU'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_CITY',
      data: { cities: ['Ouagadougou'] },
    });
  });

  it('sélectionner à nouveau une ville déjà choisie la retire (toggle)', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: ['Ouagadougou'] } });
    await handleOnboarding(cmd('CITY_OUAGADOUGOU'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_CITY',
      data: { cities: [] },
    });
  });

  it('permet de sélectionner plusieurs villes', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: ['Ouagadougou'] } });
    await handleOnboarding(cmd('CITY_BOBO_DIOULASSO'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_CITY',
      data: { cities: ['Ouagadougou', 'Bobo-Dioulasso'] },
    });
  });

  it('CITY_DONE sans aucune ville sélectionnée → re-demande, ne change pas d\'étape', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: [] } });
    await handleOnboarding(cmd('CITY_DONE'), db());
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('au moins une ville'));
    expect(setState).not.toHaveBeenCalled();
  });

  it('CITY_DONE avec au moins une ville → passe à ONBOARDING_SECTOR', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: ['Ouagadougou'] } });
    await handleOnboarding(cmd('CITY_DONE'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 1 },
    });
  });

  it('id inconnu (texte libre) → re-envoie la liste sans changer les villes', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_CITY', data: { cities: [] } });
    await handleOnboarding(cmd('OUAGADOUGOU', 'Ouagadougou'), db());
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('liste'));
    expect(setState).not.toHaveBeenCalled();
  });
});

describe('handleOnboarding — étape ONBOARDING_SECTOR (choix multiple, paginé)', () => {
  const baseData = { cities: ['Ouagadougou'], sectors: [], sectorPage: 1 };

  it('sélectionner un secteur l\'ajoute à la liste', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_SECTOR', data: baseData });
    await handleOnboarding(cmd('SECTOR_INFORMATIQUE'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: ['Informatique'], sectorPage: 1 },
    });
  });

  it('SECTOR_NEXT_PAGE passe à la page 2 sans modifier les secteurs', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_SECTOR', data: baseData });
    await handleOnboarding(cmd('SECTOR_NEXT_PAGE'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 2 },
    });
  });

  it('SECTOR_PREV_PAGE revient à la page 1', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 2 },
    });
    await handleOnboarding(cmd('SECTOR_PREV_PAGE'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 1 },
    });
  });

  it('un secteur de la page 2 (ex: Commerce/Vente) est reconnu', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: [], sectorPage: 2 },
    });
    await handleOnboarding(cmd('SECTOR_COMMERCE_VENTE'), db());
    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: ['Commerce/Vente'], sectorPage: 2 },
    });
  });

  it('SECTOR_DONE sans aucun secteur sélectionné → re-demande, ne change pas d\'étape', async () => {
    getState.mockResolvedValue({ step: 'ONBOARDING_SECTOR', data: baseData });
    await handleOnboarding(cmd('SECTOR_DONE'), db());
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('au moins un secteur'));
    expect(setState).not.toHaveBeenCalled();
  });

  it('SECTOR_DONE avec au moins un secteur → envoie les 3 boutons de contrat et passe à ONBOARDING_CONTRACT', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_SECTOR',
      data: { cities: ['Ouagadougou'], sectors: ['Informatique'], sectorPage: 1 },
    });
    await handleOnboarding(cmd('SECTOR_DONE'), db());

    expect(setState).toHaveBeenCalledWith(USER, {
      step: 'ONBOARDING_CONTRACT',
      data: { cities: ['Ouagadougou'], sectors: ['Informatique'] },
    });
    expect(sendInteractiveButtons).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ id: 'contract_cdi' }),
        expect.objectContaining({ id: 'contract_cdd' }),
        expect.objectContaining({ id: 'contract_all' }),
      ]),
    );
  });
});

describe('handleOnboarding — étape ONBOARDING_CONTRACT', () => {
  const contractState = {
    step: 'ONBOARDING_CONTRACT',
    data: { cities: ['Ouagadougou'], sectors: ['Informatique'] },
  };

  it('CONTRACT_CDI crée le profil avec ["CDI"] et les villes/secteurs multiples', async () => {
    getState.mockResolvedValue({
      step: 'ONBOARDING_CONTRACT',
      data: { cities: ['Ouagadougou', 'Bobo-Dioulasso'], sectors: ['Informatique', 'Finance'] },
    });
    const mockDb = db();
    await handleOnboarding(cmd('CONTRACT_CDI'), mockDb);
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          profile: expect.objectContaining({
            create: expect.objectContaining({
              cities: ['Ouagadougou', 'Bobo-Dioulasso'],
              sectors: ['Informatique', 'Finance'],
              contractTypes: ['CDI'],
            }),
          }),
        }),
      }),
    );
  });

  it('CONTRACT_CDD crée le profil avec ["CDD", "STAGE"]', async () => {
    getState.mockResolvedValue(contractState);
    const mockDb = db();
    await handleOnboarding(cmd('CONTRACT_CDD'), mockDb);
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          profile: expect.objectContaining({
            create: expect.objectContaining({ contractTypes: ['CDD', 'STAGE'] }),
          }),
        }),
      }),
    );
  });

  it('CONTRACT_ALL crée le profil avec CDI, CDD, STAGE, FREELANCE', async () => {
    getState.mockResolvedValue(contractState);
    const mockDb = db();
    await handleOnboarding(cmd('CONTRACT_ALL'), mockDb);
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          profile: expect.objectContaining({
            create: expect.objectContaining({
              contractTypes: expect.arrayContaining(['CDI', 'CDD', 'STAGE', 'FREELANCE']),
            }),
          }),
        }),
      }),
    );
  });

  it('bouton invalide (texte libre) → re-envoie les boutons sans créer de profil', async () => {
    getState.mockResolvedValue(contractState);
    const mockDb = db();
    await handleOnboarding(cmd('BONJOUR'), mockDb);
    expect(mockDb.user.upsert).not.toHaveBeenCalled();
    expect(sendInteractiveButtons).toHaveBeenCalled();
  });

  it('nettoie l\'état de session après création du profil', async () => {
    getState.mockResolvedValue(contractState);
    await handleOnboarding(cmd('CONTRACT_CDI'), db());
    expect(clearState).toHaveBeenCalledWith(USER);
  });

  it('ouvre la fenêtre de service après création du profil', async () => {
    getState.mockResolvedValue(contractState);
    await handleOnboarding(cmd('CONTRACT_CDI'), db());
    expect(openWindow).toHaveBeenCalledWith(USER);
  });

  it('remet l\'offset de pagination à zéro', async () => {
    getState.mockResolvedValue(contractState);
    await handleOnboarding(cmd('CONTRACT_CDI'), db());
    expect(resetOffset).toHaveBeenCalledWith(USER);
  });

  it('crée le user en FREEMIUM avec status ACTIVE', async () => {
    getState.mockResolvedValue(contractState);
    const mockDb = db();
    await handleOnboarding(cmd('CONTRACT_CDI'), mockDb);
    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ plan: 'FREEMIUM', status: 'ACTIVE' }),
      }),
    );
  });
});
