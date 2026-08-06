const CLIENT_TEST_ENV_KEYS = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID_BJ',
  'WHATSAPP_ACCESS_TOKEN_BJ',
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of CLIENT_TEST_ENV_KEYS) saved[key] = process.env[key];
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'generic-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'generic-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID_BJ = 'bj-id';
  process.env.WHATSAPP_ACCESS_TOKEN_BJ = 'bj-token';
  jest.resetModules();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ messages: [{ id: 'wamid.out' }] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  for (const key of CLIENT_TEST_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  jest.restoreAllMocks();
});

describe('sendMessage — résolution du numéro par pays', () => {
  it('utilise le numéro générique quand aucun pays n\'est passé', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendMessage } = require('../client');
    await sendMessage('+22670000001', { type: 'text', text: { body: 'hi' } });

    const [url, opts] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/generic-id/messages');
    expect(opts.headers.Authorization).toBe('Bearer generic-token');
  });

  it('utilise le numéro dédié BJ quand country="BJ"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendMessage } = require('../client');
    await sendMessage('+22970000001', { type: 'text', text: { body: 'hi' } }, 'BJ');

    const [url, opts] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/bj-id/messages');
    expect(opts.headers.Authorization).toBe('Bearer bj-token');
  });

  it('mode dry-run (pas de token) → aucun appel réseau', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendMessage } = require('../client');
    await sendMessage('+22670000001', { type: 'text', text: { body: 'hi' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
