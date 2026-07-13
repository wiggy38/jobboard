import { parseIncoming } from '../parser';

function textPayload(from: string, body: string) {
  return {
    entry: [{ changes: [{ value: { messages: [{ type: 'text', from, id: 'wamid.test', text: { body } }] } }] }],
  };
}

function buttonPayload(from: string, buttonId: string, title = 'btn') {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            type: 'interactive',
            from,
            id: 'wamid.test',
            interactive: { type: 'button_reply', button_reply: { id: buttonId, title } },
          }],
        },
      }],
    }],
  };
}

const PHONE = '+22670000001';

describe('parseIncoming — messages texte', () => {
  it('extrait userId, command en majuscules et raw intact', () => {
    expect(parseIncoming(textPayload(PHONE, 'offres'))).toEqual({
      userId: PHONE,
      command: 'OFFRES',
      raw: 'offres',
    });
  });

  it('raw préserve la casse et les espaces originaux', () => {
    const result = parseIncoming(textPayload(PHONE, 'Voir 3'));
    expect(result?.raw).toBe('Voir 3');
    expect(result?.command).toBe('VOIR 3');
  });

  it('trim la command mais pas le raw', () => {
    const result = parseIncoming(textPayload(PHONE, '  stop  '));
    expect(result?.command).toBe('STOP');
    expect(result?.raw).toBe('  stop  ');
  });
});

describe('parseIncoming — boutons interactifs', () => {
  it('extrait le button id en majuscules', () => {
    expect(parseIncoming(buttonPayload(PHONE, 'subscribe', "S'abonner"))).toEqual({
      userId: PHONE,
      command: 'SUBSCRIBE',
      raw: 'subscribe',
    });
  });

  it('contract_cdi → command CONTRACT_CDI', () => {
    const result = parseIncoming(buttonPayload(PHONE, 'contract_cdi', 'CDI'));
    expect(result?.command).toBe('CONTRACT_CDI');
  });

  it('suite → command SUITE', () => {
    const result = parseIncoming(buttonPayload(PHONE, 'suite', 'Suite'));
    expect(result?.command).toBe('SUITE');
  });
});

describe('parseIncoming — payloads ignorés', () => {
  it('retourne null pour undefined', () => expect(parseIncoming(undefined)).toBeNull());
  it('retourne null pour null', () => expect(parseIncoming(null)).toBeNull());
  it('retourne null pour objet vide', () => expect(parseIncoming({})).toBeNull());

  it('retourne null pour status de livraison (pas de messages)', () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.abc', status: 'delivered' }] } }] }],
    };
    expect(parseIncoming(payload)).toBeNull();
  });

  it('retourne null pour type non supporté (reaction)', () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              type: 'reaction',
              from: PHONE,
              id: 'wamid.test',
              reaction: { message_id: 'x', emoji: '👍' },
            }],
          },
        }],
      }],
    };
    expect(parseIncoming(payload)).toBeNull();
  });

  it('retourne null pour type audio non supporté', () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              type: 'audio',
              from: PHONE,
              id: 'wamid.test',
              audio: { id: 'media-id' },
            }],
          },
        }],
      }],
    };
    expect(parseIncoming(payload)).toBeNull();
  });
});
