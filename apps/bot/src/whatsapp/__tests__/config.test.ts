const ENV_KEYS = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID_BF',
  'WHATSAPP_ACCESS_TOKEN_BF',
  'WHATSAPP_PHONE_NUMBER_ID_BJ',
  'WHATSAPP_ACCESS_TOKEN_BJ',
];

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);

  jest.resetModules();
  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe('getWhatsAppConfig', () => {
  it('retourne le numéro générique de fallback quand aucun pays n\'est passé', () => {
    withEnv(
      { WHATSAPP_PHONE_NUMBER_ID: 'generic-id', WHATSAPP_ACCESS_TOKEN: 'generic-token' },
      () => {
        const { getWhatsAppConfig } = require('../config');
        expect(getWhatsAppConfig()).toEqual({ phoneNumberId: 'generic-id', accessToken: 'generic-token' });
      },
    );
  });

  it('retourne le numéro dédié BF quand configuré', () => {
    withEnv(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'generic-id',
        WHATSAPP_ACCESS_TOKEN: 'generic-token',
        WHATSAPP_PHONE_NUMBER_ID_BF: 'bf-id',
        WHATSAPP_ACCESS_TOKEN_BF: 'bf-token',
      },
      () => {
        const { getWhatsAppConfig } = require('../config');
        expect(getWhatsAppConfig('BF')).toEqual({ phoneNumberId: 'bf-id', accessToken: 'bf-token' });
      },
    );
  });

  it('retombe sur le fallback pour un pays sans numéro dédié configuré', () => {
    withEnv(
      { WHATSAPP_PHONE_NUMBER_ID: 'generic-id', WHATSAPP_ACCESS_TOKEN: 'generic-token' },
      () => {
        const { getWhatsAppConfig } = require('../config');
        expect(getWhatsAppConfig('BJ')).toEqual({ phoneNumberId: 'generic-id', accessToken: 'generic-token' });
      },
    );
  });

  it('retombe sur le fallback si un seul des deux (id/token) est configuré pour un pays', () => {
    withEnv(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'generic-id',
        WHATSAPP_ACCESS_TOKEN: 'generic-token',
        WHATSAPP_PHONE_NUMBER_ID_BF: 'bf-id',
        // WHATSAPP_ACCESS_TOKEN_BF manquant
      },
      () => {
        const { getWhatsAppConfig } = require('../config');
        expect(getWhatsAppConfig('BF')).toEqual({ phoneNumberId: 'generic-id', accessToken: 'generic-token' });
      },
    );
  });
});

describe('getCountryFromPhoneNumberId', () => {
  it('résout le pays depuis le phone_number_id dédié', () => {
    withEnv(
      {
        WHATSAPP_PHONE_NUMBER_ID_BF: 'bf-id',
        WHATSAPP_ACCESS_TOKEN_BF: 'bf-token',
        WHATSAPP_PHONE_NUMBER_ID_BJ: 'bj-id',
        WHATSAPP_ACCESS_TOKEN_BJ: 'bj-token',
      },
      () => {
        const { getCountryFromPhoneNumberId } = require('../config');
        expect(getCountryFromPhoneNumberId('bf-id')).toBe('BF');
        expect(getCountryFromPhoneNumberId('bj-id')).toBe('BJ');
      },
    );
  });

  it('retourne undefined pour un phone_number_id inconnu', () => {
    withEnv({ WHATSAPP_PHONE_NUMBER_ID_BF: 'bf-id', WHATSAPP_ACCESS_TOKEN_BF: 'bf-token' }, () => {
      const { getCountryFromPhoneNumberId } = require('../config');
      expect(getCountryFromPhoneNumberId('unknown-id')).toBeUndefined();
    });
  });

  it('retourne undefined pour undefined en entrée', () => {
    withEnv({}, () => {
      const { getCountryFromPhoneNumberId } = require('../config');
      expect(getCountryFromPhoneNumberId(undefined)).toBeUndefined();
    });
  });
});
