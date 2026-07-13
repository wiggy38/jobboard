import { ContractType, JobOffer, JobOfferStatus, UserPlan } from '@prisma/client';
import { InteractiveButtonMessage, InteractiveCtaUrlMessage, OutgoingMessage, TextMessage } from '../../whatsapp/types';
import {
  formatJobMessage,
  formatNoMoreOffers,
  formatPaginationPrompt,
  formatTeaserSummary,
} from '../formatter';
import { deliverJobsBatch } from '../delivery';

beforeAll(() => {
  process.env.TOKEN_SECRET = 'test_token_secret_32chars_minimum_x';
  process.env.WEB_BASE_URL = 'https://tumaa.bf';
});

function makeJob(overrides: Partial<JobOffer> = {}): JobOffer {
  return {
    id: 'job-1',
    title: 'Développeur Web',
    organization: 'Acme Corp',
    city: 'Ouagadougou',
    sector: 'Tech',
    level: 'Junior',
    contractType: ContractType.CDI,
    description: null,
    requirements: null,
    contactEmail: 'contact@acme.com',
    contactPhone: null,
    contactAddress: null,
    applicationUrl: null,
    sourceId: 'src-1',
    sourceUrl: 'https://example.com',
    isSponsored: false,
    hash: 'abc123',
    publishedAt: new Date('2026-06-01'),
    deadline: new Date('2026-07-01'),
    status: JobOfferStatus.ACTIVE,
    validated: false,
    ttlDays: 30,
    scoreConfidence: 0.8,
    isFraudSuspect: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── formatJobMessage ──────────────────────────────────────────────────────────

describe('formatJobMessage', () => {
  it('returns type "interactive" for FREEMIUM', () => {
    const msg = formatJobMessage(makeJob(), UserPlan.FREEMIUM, 'user-1');
    expect(msg.type).toBe('interactive');
  });

  it('returns type "interactive" cta_url for PREMIUM with a tumaa.bf/offre link in the button', () => {
    const msg = formatJobMessage(makeJob(), UserPlan.PREMIUM, 'user-1') as InteractiveCtaUrlMessage;
    expect(msg.type).toBe('interactive');
    expect(msg.interactive.type).toBe('cta_url');
    expect(msg.interactive.action.parameters.url).toContain('https://tumaa.bf/offre/');
  });

  it('PREMIUM message body has no offer link', () => {
    const msg = formatJobMessage(makeJob(), UserPlan.PREMIUM, 'user-1') as InteractiveCtaUrlMessage;
    expect(msg.interactive.body.text).not.toContain('https://tumaa.bf/offre/');
  });

  it('FREEMIUM message uses a cta_url button with the tokenized offer link', () => {
    const msg = formatJobMessage(makeJob(), UserPlan.FREEMIUM, 'user-1') as InteractiveCtaUrlMessage;
    expect(msg.interactive.type).toBe('cta_url');
    expect(msg.interactive.action.parameters.url).toContain('https://tumaa.bf/offre/');
  });

  it('FREEMIUM message body has no offer link and no organization name', () => {
    const msg = formatJobMessage(makeJob(), UserPlan.FREEMIUM, 'user-1') as InteractiveCtaUrlMessage;
    expect(msg.interactive.body.text).not.toContain('https://tumaa.bf/offre/');
    expect(msg.interactive.body.text).not.toContain('Acme Corp');
  });

  it('premium link contains a JWT token for the job', () => {
    const msg = formatJobMessage(makeJob({ id: 'job-abc' }), UserPlan.PREMIUM, 'user-xyz') as InteractiveCtaUrlMessage;
    // JWT token has 3 base64url segments separated by dots, passed as ?t= query param
    expect(msg.interactive.action.parameters.url).toMatch(/\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it('formats null deadline as "Non précisée"', () => {
    const msg = formatJobMessage(makeJob({ deadline: null }), UserPlan.PREMIUM, 'u1') as InteractiveCtaUrlMessage;
    expect(msg.interactive.body.text).toContain('Non précisée');
  });

  it('falls back to contactEmail (masked) when applicationUrl is absent', () => {
    const msg = formatJobMessage(
      makeJob({ applicationUrl: null, contactEmail: 'jobs@example.com' }),
      UserPlan.PREMIUM,
      'u1',
    ) as InteractiveCtaUrlMessage;
    expect(msg.interactive.body.text).toContain('job***');
  });

  it('PREMIUM message body has no URL at all, even when applicationUrl is set', () => {
    const msg = formatJobMessage(
      makeJob({ applicationUrl: 'https://source-site.example/apply/123' }),
      UserPlan.PREMIUM,
      'u1',
    ) as InteractiveCtaUrlMessage;
    expect(msg.interactive.body.text).not.toMatch(/https?:\/\//);
  });
});

// ── formatTeaserSummary ───────────────────────────────────────────────────────

describe('formatTeaserSummary', () => {
  it('returns a no-offers message when count is 0', () => {
    const msg = formatTeaserSummary(0);
    expect(msg.type).toBe('text');
    expect(msg.text.body).toContain('Aucune nouvelle offre');
  });

  it('includes count in message body', () => {
    const msg = formatTeaserSummary(3);
    expect(msg.text.body).toContain('3 offre(s)');
  });
});

// ── formatPaginationPrompt ────────────────────────────────────────────────────

describe('formatPaginationPrompt', () => {
  it('includes remaining count in body text', () => {
    const msg = formatPaginationPrompt(2);
    expect(msg.interactive.body.text).toContain('2');
  });

  it('pagination button has id "suite"', () => {
    const msg = formatPaginationPrompt(2);
    expect(msg.interactive.action.buttons[0].reply.id).toBe('suite');
  });
});

// ── formatNoMoreOffers ────────────────────────────────────────────────────────

describe('formatNoMoreOffers', () => {
  it('mentions OFFRES and MODIFIER commands', () => {
    const msg = formatNoMoreOffers();
    expect(msg.text.body).toContain('OFFRES');
    expect(msg.text.body).toContain('MODIFIER');
  });
});

// ── deliverJobsBatch ──────────────────────────────────────────────────────────

describe('deliverJobsBatch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends only the teaser when job list is empty', async () => {
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);
    const promise = deliverJobsBatch('user-1', 'db-user-1', [], UserPlan.PREMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    expect(sendFn).toHaveBeenCalledTimes(1);
    const [, msg] = sendFn.mock.calls[0];
    expect((msg as TextMessage).text.body).toContain('Aucune nouvelle offre');
  });

  it('calls sendFn 9 times for 7 jobs: 1 summary + 7 jobs + 1 pagination', async () => {
    const jobs = Array.from({ length: 7 }, (_, i) => makeJob({ id: `job-${i}` }));
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);

    const promise = deliverJobsBatch('user-1', 'db-user-1', jobs, UserPlan.PREMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    expect(sendFn).toHaveBeenCalledTimes(9);
  });

  it('sends formatNoMoreOffers for ≤5 jobs', async () => {
    const jobs = [makeJob({ id: 'job-0' }), makeJob({ id: 'job-1' })];
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);

    const promise = deliverJobsBatch('user-1', 'db-user-1', jobs, UserPlan.PREMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    // 1 summary + 2 jobs + 1 no-more = 4
    expect(sendFn).toHaveBeenCalledTimes(4);
    const lastMsg = sendFn.mock.calls.at(-1)![1] as TextMessage;
    expect(lastMsg.text.body).toContain('OFFRES');
  });

  it('sends pagination prompt for >5 jobs', async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => makeJob({ id: `job-${i}` }));
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);

    const promise = deliverJobsBatch('user-1', 'db-user-1', jobs, UserPlan.PREMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    const lastMsg = sendFn.mock.calls.at(-1)![1] as InteractiveButtonMessage;
    expect(lastMsg.type).toBe('interactive');
    expect(lastMsg.interactive.action.buttons[0].reply.id).toBe('suite');
  });

  it('uses 800ms delay between job messages', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const jobs = [makeJob({ id: 'job-0' }), makeJob({ id: 'job-1' })];
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);

    const promise = deliverJobsBatch('user-1', 'db-user-1', jobs, UserPlan.PREMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    const delayMs = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms as number)
      .filter((ms) => ms === 800);
    // One 800ms delay per job message
    expect(delayMs).toHaveLength(2);
  });

  it('job messages use the correct plan format (FREEMIUM → interactive)', async () => {
    const jobs = [makeJob({ id: 'job-0' })];
    const sendFn = jest.fn<Promise<void>, [string, OutgoingMessage]>().mockResolvedValue(undefined);

    const promise = deliverJobsBatch('user-1', 'db-user-1', jobs, UserPlan.FREEMIUM, sendFn);
    await jest.runAllTimersAsync();
    await promise;

    // call[0] = summary (text), call[1] = job (interactive), call[2] = no-more (text)
    const jobMsg = sendFn.mock.calls[1][1];
    expect(jobMsg.type).toBe('interactive');
  });
});
