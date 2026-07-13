import { handleStop } from '../stop';

jest.mock('../../../services/whatsapp', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/redis', () => {
  const RedisMock = require('ioredis-mock');
  return { redis: new RedisMock() };
});

const { sendText }  = require('../../../services/whatsapp');
const { redis }     = require('../../../lib/redis');

const USER = '+22670000001';
const cmd  = { userId: USER, command: 'STOP', raw: 'stop' };

function makeDb(user: { id: string; status: string } | null) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

beforeEach(async () => {
  await redis.flushall();
  jest.clearAllMocks();
});

describe('handleStop', () => {
  it('message d\'erreur si le numéro n\'a pas de compte', async () => {
    const db = makeDb(null);
    await handleStop(cmd, db);
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('Aucun compte'));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('informe l\'utilisateur déjà désinscrit sans le re-mettre à jour', async () => {
    const db = makeDb({ id: 'uuid-1', status: 'STOPPED' });
    await handleStop(cmd, db);
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('déjà désinscrit'));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('passe le statut à STOPPED', async () => {
    const db = makeDb({ id: 'uuid-1', status: 'ACTIVE' });
    await handleStop(cmd, db);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { status: 'STOPPED' },
    });
  });

  it('supprime la fenêtre de service Redis', async () => {
    await redis.set(`user:${USER}:window`, '1');
    const db = makeDb({ id: 'uuid-1', status: 'ACTIVE' });
    await handleStop(cmd, db);
    expect(await redis.get(`user:${USER}:window`)).toBeNull();
  });

  it('envoie le message d\'au revoir', async () => {
    const db = makeDb({ id: 'uuid-1', status: 'ACTIVE' });
    await handleStop(cmd, db);
    expect(sendText).toHaveBeenCalledWith(USER, expect.stringContaining('désinscrit'));
  });

  it('ne touche pas la fenêtre d\'un autre utilisateur', async () => {
    const OTHER = '+22670000002';
    await redis.set(`user:${OTHER}:window`, '1');
    const db = makeDb({ id: 'uuid-1', status: 'ACTIVE' });
    await handleStop(cmd, db);
    expect(await redis.get(`user:${OTHER}:window`)).toBe('1');
  });
});
