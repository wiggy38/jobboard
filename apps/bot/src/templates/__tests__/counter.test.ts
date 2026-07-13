import type { PrismaClient, TemplateType } from '@prisma/client';
import { canSendTemplate, incrementTemplateCounter, sendTemplateIfAllowed } from '../counter';

jest.mock('../../whatsapp/client', () => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendMessage } = require('../../whatsapp/client') as { sendMessage: jest.Mock };

type CounterRow = { type: TemplateType; count: number };

function makeMockDb(rows: CounterRow[] = []) {
  const upsert = jest.fn().mockResolvedValue({ count: 1 });
  const notificationCreate = jest.fn().mockResolvedValue({});

  return {
    templateCounter: {
      findUnique: jest.fn().mockImplementation(
        ({ where }: { where: { userId_month_type: { type: TemplateType } } }) => {
          const type = where.userId_month_type.type;
          const row = rows.find((r) => r.type === type);
          return Promise.resolve(row ? { count: row.count } : null);
        },
      ),
      findMany: jest.fn().mockResolvedValue(rows.map((r) => ({ count: r.count }))),
      upsert,
    },
    notification: { create: notificationCreate },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    _upsert: upsert,
    _notificationCreate: notificationCreate,
  } as unknown as PrismaClient & { _upsert: jest.Mock; _notificationCreate: jest.Mock };
}

const PHONE = '+22670000001';
const USER = 'user-tpl-test';
const TEXT_MSG = { type: 'text' as const, text: { body: 'test' } };

beforeEach(() => {
  jest.clearAllMocks();
});

// ── canSendTemplate ───────────────────────────────────────────────────────────

describe('canSendTemplate', () => {
  it("T1 – retourne true quand aucun compteur n'existe (premier envoi)", async () => {
    const db = makeMockDb([]);
    expect(await canSendTemplate(USER, 'RELANCE', db)).toBe(true);
  });

  it('T2 – RELANCE : retourne false quand count = 2 (cap = 2)', async () => {
    const db = makeMockDb([{ type: 'RELANCE', count: 2 }]);
    expect(await canSendTemplate(USER, 'RELANCE', db)).toBe(false);
  });

  it('T3 – MATCH_PARFAIT : retourne false quand count = 1 (cap = 1)', async () => {
    const db = makeMockDb([{ type: 'MATCH_PARFAIT', count: 1 }]);
    expect(await canSendTemplate(USER, 'MATCH_PARFAIT', db)).toBe(false);
  });

  it('T4 – NUDGE_PREMIUM : retourne false quand count = 1 (cap = 1)', async () => {
    const db = makeMockDb([{ type: 'NUDGE_PREMIUM', count: 1 }]);
    expect(await canSendTemplate(USER, 'NUDGE_PREMIUM', db)).toBe(false);
  });

  it('T5 – global cap : retourne false quand total mensuel = 3', async () => {
    const db = makeMockDb([
      { type: 'RELANCE', count: 1 },
      { type: 'MATCH_PARFAIT', count: 1 },
      { type: 'NUDGE_PREMIUM', count: 1 },
    ]);
    expect(await canSendTemplate(USER, 'RELANCE', db)).toBe(false);
  });

  it('T6 – retourne true quand total = 2 et type sous son cap', async () => {
    const db = makeMockDb([
      { type: 'RELANCE', count: 1 },
      { type: 'MATCH_PARFAIT', count: 1 },
    ]);
    expect(await canSendTemplate(USER, 'RELANCE', db)).toBe(true);
  });
});

// ── incrementTemplateCounter ──────────────────────────────────────────────────

describe('incrementTemplateCounter', () => {
  it('T7 – appelle upsert pour un premier envoi', async () => {
    const db = makeMockDb([]);
    await incrementTemplateCounter(USER, 'RELANCE', db);
    expect((db as ReturnType<typeof makeMockDb>)._upsert).toHaveBeenCalledTimes(1);
  });

  it('T8 – leve une erreur si le compteur de type est au cap', async () => {
    const db = makeMockDb([{ type: 'MATCH_PARFAIT', count: 1 }]);
    await expect(incrementTemplateCounter(USER, 'MATCH_PARFAIT', db)).rejects.toThrow(
      'Template cap reached',
    );
  });

  it('T9 – 3 appels concurrents via Promise.all sans crash', async () => {
    const db = makeMockDb([]);
    await expect(
      Promise.all([
        incrementTemplateCounter(USER, 'RELANCE', db),
        incrementTemplateCounter(USER, 'RELANCE', db),
        incrementTemplateCounter(USER, 'RELANCE', db),
      ]),
    ).resolves.not.toThrow();
  });
});

// ── sendTemplateIfAllowed ─────────────────────────────────────────────────────

describe('sendTemplateIfAllowed', () => {
  it('T10 – envoie le message et retourne { sent: true } quand autorise', async () => {
    const db = makeMockDb([]);
    const result = await sendTemplateIfAllowed(USER, 'RELANCE', TEXT_MSG, PHONE, db);

    expect(result).toEqual({ sent: true });
    expect(sendMessage).toHaveBeenCalledWith(PHONE, TEXT_MSG);
    expect((db as ReturnType<typeof makeMockDb>)._notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPaid: true, userId: USER }) }),
    );
  });

  it('T11 – retourne LIMIT_REACHED quand cap type atteint', async () => {
    const db = makeMockDb([{ type: 'MATCH_PARFAIT', count: 1 }]);
    const result = await sendTemplateIfAllowed(USER, 'MATCH_PARFAIT', TEXT_MSG, PHONE, db);

    expect(result).toEqual({ sent: false, reason: 'LIMIT_REACHED' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect((db as ReturnType<typeof makeMockDb>)._notificationCreate).not.toHaveBeenCalled();
  });

  it('T12 – 4e appel bloque quand total mensuel = 3', async () => {
    const db = makeMockDb([
      { type: 'RELANCE', count: 2 },
      { type: 'MATCH_PARFAIT', count: 1 },
    ]);
    const result = await sendTemplateIfAllowed(USER, 'NUDGE_PREMIUM', TEXT_MSG, PHONE, db);

    expect(result).toEqual({ sent: false, reason: 'LIMIT_REACHED' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("T13 – enregistre la notification avec isPaid: true et le bon templateType", async () => {
    const db = makeMockDb([]);
    await sendTemplateIfAllowed(USER, 'NUDGE_PREMIUM', TEXT_MSG, PHONE, db);

    expect((db as ReturnType<typeof makeMockDb>)._notificationCreate).toHaveBeenCalledWith({
      data: {
        userId: USER,
        type: 'NUDGE_PREMIUM',
        isPaid: true,
        templateType: 'NUDGE_PREMIUM',
        status: 'SENT',
      },
    });
  });

  it("T14 – n'incremente pas le compteur si sendMessage echoue", async () => {
    sendMessage.mockRejectedValueOnce(new Error('WhatsApp network error'));
    const db = makeMockDb([]);

    await expect(
      sendTemplateIfAllowed(USER, 'RELANCE', TEXT_MSG, PHONE, db),
    ).rejects.toThrow('WhatsApp network error');

    expect((db as ReturnType<typeof makeMockDb>)._upsert).not.toHaveBeenCalled();
    expect((db as ReturnType<typeof makeMockDb>)._notificationCreate).not.toHaveBeenCalled();
  });
});
