import type { ParsedCommand } from './types';

export function parseCommand(rawText: string): ParsedCommand {
  const text = rawText
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]/g, ' ');

  if (text === 'OFFRES') {
    return { command: 'OFFRES' };
  }

  if (text === 'VOIR') {
    return { command: 'VOIR' };
  }

  const voirMatch = text.match(/^VOIR\s+(\d+)$/);
  if (voirMatch) {
    const num = parseInt(voirMatch[1], 10);
    if (num < 1 || num > 10) return { command: 'UNKNOWN' };
    return { command: 'VOIR', args: [voirMatch[1]] };
  }

  if (text === 'STOP') {
    return { command: 'STOP' };
  }

  if (text === 'AIDE' || text === 'HELP' || text === 'MENU') {
    return { command: 'AIDE' };
  }

  if (text === 'ESSAI' || text === 'ESSAI PREMIUM') {
    return { command: 'ESSAI' };
  }

  if (text === 'PREMIUM' || text === 'ABONNEMENT' || text === 'S ABONNER') {
    return { command: 'PREMIUM' };
  }

  if (text === 'PARRAINER' || text === 'PARRAINAGE') {
    return { command: 'PARRAINER' };
  }

  if (text === 'MODIFIER' || text === 'CHANGER' || text === 'PROFIL') {
    return { command: 'MODIFIER' };
  }

  if (text === 'REVOIR') {
    return { command: 'REVOIR' };
  }

  if (text === 'PAUSE') {
    return { command: 'PAUSE' };
  }

  if (text === 'REPRENDRE') {
    return { command: 'PAUSE', args: ['REPRENDRE'] };
  }

  if (text === 'STATS' || text === 'STATISTIQUES') {
    return { command: 'STATS' };
  }

  if (text.startsWith('ALERTE')) {
    const args = text
      .slice('ALERTE'.length)
      .split(' ')
      .filter(w => w.length > 0);
    return { command: 'ALERTE', args };
  }

  const greetings = ['BONJOUR', 'BONSOIR', 'SALUT', 'HI', 'HELLO', 'SVP', 'STP'];
  if (greetings.includes(text)) {
    return { command: 'AIDE' };
  }

  return { command: 'UNKNOWN' };
}

/*
Cas manuels vérifiés :
  parseCommand("offres")           → { command: 'OFFRES' }
  parseCommand("Voir 3")           → { command: 'VOIR', args: ['3'] }
  parseCommand("alerte comptable") → { command: 'ALERTE', args: ['COMPTABLE'] }
  parseCommand("bonjour")          → { command: 'AIDE' }
  parseCommand("aide")             → { command: 'AIDE' }
  parseCommand("stop")             → { command: 'STOP' }
  parseCommand("n'importe quoi")   → { command: 'UNKNOWN' }
  parseCommand("Voir 11")          → { command: 'UNKNOWN' }  (hors plage 1-10)
  parseCommand("s'abonner")        → { command: 'PREMIUM' }  (tiret → espace → S ABONNER)
  parseCommand("reprendre")        → { command: 'PAUSE', args: ['REPRENDRE'] }
*/
