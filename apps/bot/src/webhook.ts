import type { WhatsAppMessage, BotContext } from './types';
import { parseCommand } from './parser';
import { upsertUser } from './services/pull';
import { isWindowOpen } from './services/window';
import { sendText } from './services/whatsapp';
import { reactivateUser } from './counters';
import { handleOffres } from './handlers/offres';
import { handleVoir } from './handlers/voir';
import { handleStop } from './handlers/stop';
import { handleAide } from './handlers/aide';
import { handleStats } from './handlers/stats';
import { handleDefault } from './handlers/default';

const PLACEHOLDER = 'Fonctionnalité bientôt disponible. Réponds AIDE pour les commandes.';

export async function handleMessage(msg: WhatsAppMessage): Promise<void> {
  const start = Date.now();

  try {
    let { id: userId, plan, status } = await upsertUser(msg.from);
    if (status === 'DORMANT') {
      await reactivateUser(userId);
      status = 'ACTIVE';
    }
    const windowOpen = await isWindowOpen(userId);
    const parsed = parseCommand(msg.body);

    const ctx: BotContext = {
      message: msg,
      parsed,
      userId,
      userPlan: plan,
      userStatus: status,
      windowOpen,
    };

    switch (parsed.command) {
      case 'OFFRES':    await handleOffres(ctx); break;
      case 'VOIR':      await handleVoir(ctx); break;
      case 'STOP':      await handleStop(ctx); break;
      case 'AIDE':      await handleAide(ctx); break;
      case 'STATS':     await handleStats(ctx); break;
      case 'ESSAI':
      case 'PREMIUM':
      case 'PARRAINER':
      case 'MODIFIER':
      case 'REVOIR':
      case 'PAUSE':
      case 'ALERTE':    await sendText(msg.from, PLACEHOLDER); break;
      case 'UNKNOWN':
      default:          await handleDefault(ctx); break;
    }

    console.log(`[Bot] ${msg.from} → ${parsed.command} (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`[Bot] Erreur ${msg.from} → ${msg.body}:`, err);
    try {
      await sendText(
        msg.from,
        'Une erreur est survenue. Réessaie dans quelques instants. Écris AIDE pour les commandes.',
      );
    } catch {
      // silence
    }
  }
}
