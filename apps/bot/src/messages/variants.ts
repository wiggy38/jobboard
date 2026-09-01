export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Insère le prénom après "Bonjour"/"Salut"/"Voilà" sans laisser d'espace ni de
// "undefined"/"null" quand il n'est pas renseigné (User.displayName est facultatif et
// n'est aujourd'hui rempli par aucun flux d'inscription).
export function greetSuffix(prenom?: string | null): string {
  return prenom ? ` ${prenom}` : '';
}

// ── Intro — des offres ont été trouvées ────────────────────────────────────────

export const INTRO_VARIANTS: Array<(prenom: string | null | undefined, nb: number) => string> = [
  (prenom, nb) =>
    `Bonjour${greetSuffix(prenom)} 👋\n` +
    `J'ai trouvé ${nb} offres qui correspondent à votre profil aujourd'hui.\n` +
    "Je vous les envoie une par une, juste en dessous.",
  (prenom, nb) =>
    `Salut${greetSuffix(prenom)} ! 🌍\n` +
    `Voici ce que j'ai déniché pour vous : ${nb} offres triées selon vos critères.\n` +
    'Prenez le temps de regarder, elles arrivent tout de suite.',
  (prenom, nb) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    `${nb} offres pour vous ce matin. Les mieux notées d'abord.\n` +
    'C\'est parti 👇',
];

// ── Aucune offre du tout aujourd'hui ────────────────────────────────────────────

export const NO_OFFERS_VARIANTS: Array<(prenom: string | null | undefined) => string> = [
  (prenom) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    'Rien de nouveau pour vos critères aujourd\'hui. Je continue de chercher.\n' +
    'Tapez OFFRES demain pour voir si quelque chose est arrivé.',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)} 👋\n` +
    'Pas de nouvelle offre correspondant à votre profil pour le moment — ça arrive, certains jours sont plus calmes.\n' +
    'Je garde vos critères en tête et je continue de chercher.',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    "Rien à vous proposer aujourd'hui sur vos critères actuels.\n" +
    'Tapez MODIFIER pour ajouter une ville ou un secteur — ça élargit souvent les résultats.',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)} 👋\n` +
    "J'ai passé les sources en revue ce matin : rien qui corresponde à votre profil.\n" +
    'Je recommence demain. Tapez OFFRES pour voir le résultat.',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    'Rien pour vous aujourd\'hui 🤷 Mais je continue de chercher.\n' +
    'À demain !',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)} 💪\n` +
    "Aucune offre ne correspond à vos critères pour l'instant. Ça ne veut pas dire que rien n'arrive — les offres se publient tout au long de la semaine.\n" +
    'Je continue de chercher, revenez avec OFFRES.',
  (prenom) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    "Rien de nouveau sur vos critères aujourd'hui.\n" +
    'Deux options : attendre demain et retaper OFFRES, ou tapez MODIFIER pour élargir un peu votre recherche.',
];

// Utilisée quand hasZeroOfferStreak() détecte plusieurs jours consécutifs sans offre —
// suggère explicitement d'élargir les critères plutôt que d'attendre encore.
export const NO_OFFERS_STREAK_VARIANT = (prenom: string | null | undefined): string =>
  `Bonjour${greetSuffix(prenom)},\n` +
  'Toujours rien sur vos critères depuis quelques jours. Vos filtres sont peut-être un peu serrés.\n' +
  'Tapez MODIFIER pour ajouter une ville ou un secteur — je continue de chercher en attendant.';

// ── Clôture — fin de liste / pagination épuisée ─────────────────────────────────

export const CLOSING_VARIANTS: Array<(prenom: string | null | undefined, nb?: number) => string> = [
  (prenom) =>
    `Voilà pour aujourd'hui${greetSuffix(prenom)} ✅\n` +
    'Je continue de chercher pour vous. Tapez OFFRES demain pour voir les nouveautés.',
  (prenom) =>
    `C'est tout pour ce lot${greetSuffix(prenom)} 👍\n` +
    'Mais je ne m\'arrête pas là : je passe les sources en revue chaque jour pour vous.\n' +
    'À demain avec OFFRES 👋',
  (prenom, nb) =>
    `Voilà${greetSuffix(prenom)} — ${nb ?? 0} pistes de plus 💪\n` +
    'Je continue de chercher de mon côté. Revenez quand vous voulez.',
  (prenom) =>
    `Vous avez tout vu${greetSuffix(prenom)} 🎉\n` +
    'Je continue de fouiller les offres pour vous — de nouvelles arrivent chaque jour.\n' +
    'Tapez OFFRES demain.',
  (prenom) =>
    `Fin de la liste${greetSuffix(prenom)} ✅\n` +
    'Je garde vos critères en tête et je continue de chercher.\n' +
    'OFFRES → nouvelle recherche\n' +
    'MODIFIER → ajuster vos critères',
  (prenom) =>
    `C'est tout pour maintenant${greetSuffix(prenom)}.\n` +
    'Je continue de chercher 🔎 À bientôt avec OFFRES !',
];
