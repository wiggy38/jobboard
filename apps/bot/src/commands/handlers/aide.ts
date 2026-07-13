import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { getUserWithProfile } from '../../services/pull';
import { sendText } from '../../services/whatsapp';

export async function handleAide(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await getUserWithProfile(cmd.userId);
  const plan = user?.plan ?? 'FREEMIUM';

  const isPremium = plan !== 'FREEMIUM';
  const isElite = plan === 'ELITE';

  const lines = [
    '📖 *TUMAA — Commandes disponibles*',
    '',
    'OFFRES — Recevoir les offres du jour',
    'SUITE — Voir les offres suivantes',
    'VOIR N — Débloquer le détail de l\'offre N',
    'MODIFIER — Changer tes critères (ville, secteur)',
    'STATS — Offres disponibles pour ton profil',
    'ESSAI — 48h Premium gratuits (une seule fois)',
    'PREMIUM — Voir les formules d\'abonnement',
    'PARRAINER — Gagner des jours Premium',
    'PAUSE — Suspendre les notifications',
    'STOP — Se désabonner définitivement',
    ...(isPremium ? ['REVOIR — Rappeler une offre manquée'] : []),
    ...(isPremium ? ['ALERTE [mot] — Créer une alerte mot-clé'] : []),
    ...(isElite ? ['PAYS — Choisir jusqu\'à 3 pays de recherche'] : []),
    'AIDE — Afficher ce menu',
  ];

  await sendText(cmd.userId, lines.join('\n'));
}
