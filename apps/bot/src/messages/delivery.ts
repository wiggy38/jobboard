import { JobOffer, UserPlan } from '@prisma/client';
import { OutgoingMessage } from '../whatsapp/types';
import {
  formatJobMessage,
  formatNoMoreOffers,
  formatPaginationPrompt,
  formatTeaserSummary,
} from './formatter';

const BATCH_SIZE = 5;
const MESSAGE_DELAY_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverJobsBatch(
  phone: string,
  dbUserId: string,
  jobs: JobOffer[],
  userPlan: UserPlan,
  sendFn: (to: string, msg: OutgoingMessage) => Promise<void>,
): Promise<void> {
  if (jobs.length === 0) {
    await sendFn(phone, formatTeaserSummary(0));
    return;
  }

  await sendFn(phone, formatTeaserSummary(jobs.length));

  for (const job of jobs) {
    await delay(MESSAGE_DELAY_MS);
    await sendFn(phone, formatJobMessage(job, userPlan, dbUserId));
  }

  if (jobs.length > BATCH_SIZE) {
    await sendFn(phone, formatPaginationPrompt(jobs.length - BATCH_SIZE));
  } else {
    await sendFn(phone, formatNoMoreOffers());
  }
}
