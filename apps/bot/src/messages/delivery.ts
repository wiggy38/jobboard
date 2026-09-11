import { JobOffer, UserPlan } from '@prisma/client';
import { OutgoingMessage } from '../whatsapp/types';
import {
  formatDailyQuote,
  formatJobMessage,
  formatNoMoreOffers,
  formatPaginationPrompt,
  formatTeaserSummary,
} from './formatter';

const MESSAGE_DELAY_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverJobsBatch(
  phone: string,
  dbUserId: string,
  jobs: JobOffer[],
  userPlan: UserPlan,
  sendFn: (to: string, msg: OutgoingMessage, country?: string) => Promise<void>,
  country?: string,
  displayName?: string | null,
  showIntro = true,
  totalRemaining = 0,
  totalMatched?: number,
): Promise<void> {
  if (showIntro) {
    await sendFn(phone, formatDailyQuote(), country);
    await delay(MESSAGE_DELAY_MS);
    await sendFn(phone, formatTeaserSummary(totalMatched ?? jobs.length, displayName), country);
  }

  for (const job of jobs) {
    await delay(MESSAGE_DELAY_MS);
    await sendFn(phone, formatJobMessage(job, userPlan, dbUserId), country);
  }

  if (totalRemaining > 0) {
    await sendFn(phone, formatPaginationPrompt(jobs.length, totalRemaining, showIntro), country);
  } else {
    await sendFn(phone, formatNoMoreOffers(displayName, jobs.length), country);
  }
}
