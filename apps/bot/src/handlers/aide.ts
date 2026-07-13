import { BotContext } from '../types';
import { sendText } from '../services/whatsapp';

export async function handleAide(ctx: BotContext): Promise<void> {
  const plan = ctx.userPlan;
  const showRevoir = plan !== 'FREEMIUM';
  const showAlerte = plan !== 'FREEMIUM';

  const lines = [
    '📖 TUMAA — Commandes disponibles',
    '',
    'OFFRES — Recevoir les offres du jour',
    'VOIR N — Débloquer le détail de l\'offre N',
    'MODIFIER — Changer tes critères (ville, secteur)',
    'STATS — Offres disponibles pour ton profil',
    'ESSAI — 48h Premium gratuits (une seule fois)',
    'PREMIUM — Voir les formules d\'abonnement',
    'PARRAINER — Gagner des jours Premium',
    'PAUSE — Suspendre les notifications',
    'STOP — Se désabonner définitivement',
    ...(showRevoir ? ['REVOIR — Rappeler une offre manquée'] : []),
    ...(showAlerte ? ['ALERTE [mot] — Créer une alerte mot-clé'] : []),
    'AIDE — Afficher ce menu',
  ];

  await sendText(ctx.message.from, lines.join('\n'));
}
