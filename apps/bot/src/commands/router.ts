import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../whatsapp/types';
import { getState } from '../session/state';
import { handleOnboarding, startOnboarding } from './handlers/onboarding';
import { handleOffres } from './handlers/offres';
import { handleSuite } from './handlers/suite';
import { handleVoir } from './handlers/voir';
import { handleModifier } from './handlers/modifier';
import { handlePremium } from './handlers/premium';
import { handleParrainer } from './handlers/parrainer';
import { handleEssai } from './handlers/essai';
import { handlePause } from './handlers/pause';
import { handleStop } from './handlers/stop';
import { handleAide } from './handlers/aide';
import { handleStats } from './handlers/stats';
import { handleJoinChannel } from './handlers/joinChannel';
import { handlePays, handlePaysSelection } from './handlers/pays';
import { handleUnknown } from './handlers/unknown';

type Handler = (cmd: ParsedCommand, db: PrismaClient) => Promise<void>;

// Button reply IDs (lowercase) are already uppercased by the parser before reaching here.
// We normalize again as a safety net, then match the first token only so "VOIR 1" routes to VOIR.
const ROUTES: Record<string, Handler> = {
  OFFRES: handleOffres,
  SUITE: handleSuite,      // text "SUITE" and button id "suite" both arrive as SUITE
  VOIR: handleVoir,
  MODIFIER: handleModifier,
  PREMIUM: handlePremium,
  SUBSCRIBE: handlePremium, // button id "subscribe" → uppercased to SUBSCRIBE
  PARRAINER: handleParrainer,
  ESSAI: handleEssai,
  PAUSE: handlePause,
  STOP: handleStop,
  AIDE: handleAide,
  STATS: handleStats,
  JOIN_CHANNEL: handleJoinChannel,
  PAYS: handlePays,
};

export async function routeCommand(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  // Resume active session flows before any other routing
  const state = await getState(cmd.userId);
  if (state?.step.startsWith('ONBOARDING_')) {
    await handleOnboarding(cmd, db);
    return;
  }

  if (state?.step === 'PREMIUM_CHOICE') {
    await handlePremium(cmd, db);
    return;
  }

  if (state?.step === 'ELITE_COUNTRY_SELECT') {
    await handlePaysSelection(cmd, db);
    return;
  }

  // Detect new user (no DB record) and start onboarding
  const existing = await db.user.findUnique({
    where: { phone: cmd.userId },
    select: { id: true },
  });
  if (!existing) {
    await startOnboarding(cmd);
    return;
  }

  // First token handles compound commands like "VOIR 1" and normalizes button ids
  const key = cmd.command.trim().toUpperCase().split(/\s+/)[0];
  const handler = ROUTES[key] ?? handleUnknown;
  await handler(cmd, db);
}
