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
    `${nb} offres pour vous. Les mieux notées d'abord.\n` +
    'C\'est parti 👇',
  (prenom, nb) =>
    `Hello${greetSuffix(prenom)} 👋\n` +
    `${nb} offres fraîches correspondent à votre profil.\n` +
    'Elles arrivent juste en dessous.',
  (prenom, nb) =>
    `Bonjour${greetSuffix(prenom)} ✨\n` +
    `${nb} offres qui collent à vos critères aujourd'hui.\n` +
    'Je vous les envoie une par une.',
  (prenom, nb) =>
    `Salut${greetSuffix(prenom)},\n` +
    `Bonne nouvelle : ${nb} offres correspondent à votre profil.\n` +
    'On regarde ça ensemble tout de suite 👇',
  (prenom, nb) =>
    `Bonjour${greetSuffix(prenom)} 🔎\n` +
    `${nb} offres repérées pour vous après passage en revue des sources.\n` +
    "Elles arrivent, dans l'ordre de pertinence.",
  (prenom, nb) =>
    `Coucou${greetSuffix(prenom)} 👋\n` +
    `${nb} offres à découvrir, sélectionnées selon vos critères.\n` +
    'Je vous les envoie une par une.',
  (prenom, nb) =>
    `Bonjour${greetSuffix(prenom)},\n` +
    `${nb} offres qui pourraient vous intéresser.\n` +
    'Direction juste en dessous 👇',
  (prenom, nb) =>
    `Salut${greetSuffix(prenom)} 🌟\n` +
    `${nb} offres triées pour vous, les plus pertinentes en premier.\n` +
    "C'est parti !",
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
    "J'ai passé les sources en revue : rien qui corresponde à votre profil.\n" +
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
    'Je continue de chercher de mon côté. Revenez avec OFFRES quand vous voulez.',
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

// ── Pensée du jour — citation envoyée avant l'intro ─────────────────────────────
// Persévérance
export const DAILY_QUOTE_VARIANTS: string[] = [
  "La chute n'est pas un échec. L'échec, c'est de rester là où l'on est tombé. — Socrate (souvent attribué)",
  'Notre plus grande gloire n\'est pas de ne jamais tomber, mais de nous relever chaque fois. — Confucius (attribution discutée)',
  "Cela semble toujours impossible, jusqu'à ce qu'on le fasse. — Nelson Mandela",
  'Le succès, c\'est tomber sept fois et se relever huit. — Proverbe japonais',
  "Petit à petit, l'oiseau fait son nid. — Proverbe populaire",
  'Qui veut voyager loin ménage sa monture. — Proverbe français',
  "À cœur vaillant, rien d'impossible. — Proverbe français",
  'Celui qui cherche trouve. — Proverbe populaire',
  // Ne pas abandonner
  'Ne baisse jamais les bras. — Dicton populaire',
  'Après la pluie vient le beau temps. — Proverbe populaire',
  "Quand une porte se ferme, une autre s'ouvre. — Proverbe populaire",
  'Même la nuit la plus longue prend fin. — Proverbe populaire',
  "Il n'y a pas de vent favorable pour celui qui ne sait où il va. — Sénèque",
  'La patience est amère, mais son fruit est doux. — Aristote',
  'Un voyage de mille lieues commence toujours par un premier pas. — Lao Tseu',
  // Action et opportunités
  "Le meilleur moment pour commencer, c'était hier. Le deuxième meilleur moment, c'est maintenant. — Proverbe",
  "L'avenir dépend de ce que nous faisons dans le présent. — Mahatma Gandhi",
  'La chance sourit aux audacieux. — Virgile',
  'Qui ne tente rien n\'a rien. — Proverbe populaire',
  "Fais de ta vie un rêve, et d'un rêve, une réalité. — Antoine de Saint-Exupéry",
  "Les grandes choses sont faites d'un ensemble de petites choses. — Vincent van Gogh",
  // Proverbes africains
  'Seul, on va plus vite. Ensemble, on va plus loin. — Proverbe africain',
  'Si tu veux aller vite, marche seul. Si tu veux aller loin, marchons ensemble. — Proverbe africain',
  'Le soleil se lève pour tout le monde. — Proverbe africain',
  'Celui qui demande son chemin ne se perd jamais. — Proverbe africain',
  "La rivière atteint sa destination parce qu'elle sait contourner les obstacles. — Proverbe africain",
  'Même le lion doit parfois se battre contre les mouches. — Proverbe africain',
  // Persévérance et résilience
  "La difficulté n'est pas de comprendre les idées nouvelles, mais d'échapper aux anciennes. — John Maynard Keynes",
  "Il n'y a qu'une façon d'éviter les critiques : ne fais rien, ne dis rien, ne sois rien. — Aristote (attribution discutée)",
  'Ce qui ne nous tue pas nous rend plus forts. — Friedrich Nietzsche',
  "La réussite appartient à tout le monde. C'est au travail d'équipe qu'en revient le mérite. — Franck Piccard",
  "Le courage n'est pas l'absence de peur, mais la capacité de vaincre ce qui fait peur. — Nelson Mandela (formulation souvent attribuée)",
  'La persévérance est la clé de la réussite. — Proverbe populaire',
  'Il faut parfois perdre une bataille pour gagner la guerre. — Proverbe populaire',
  "Celui qui tombe et se relève est plus fort que celui qui n'est jamais tombé. — Proverbe populaire",
  'Les grandes réussites sont souvent précédées de grands obstacles. — Proverbe populaire',
  "Tant qu'il y a de la vie, il y a de l'espoir. — Proverbe populaire",
  // Patience, temps et progression
  "Rome ne s'est pas faite en un jour. — Proverbe populaire",
  'La patience vient à bout de tout. — Proverbe populaire',
  'Chaque chose en son temps. — Proverbe populaire',
  'Qui va doucement va sûrement. — Proverbe populaire',
  "Goutte à goutte, l'eau creuse la pierre. — Proverbe populaire",
  "L'important n'est pas d'aller vite, mais de ne pas s'arrêter. — Proverbe populaire",
  'Un pas après l\'autre, on avance toujours. — Formule populaire',
  'Le chemin le plus long commence toujours par un premier pas. — Formule populaire',
  // Courage et passage à l'action
  'Le succès est la somme de petits efforts, répétés jour après jour. — Robert Collier (formulation couramment attribuée)',
  "Agissez comme s'il était impossible d'échouer. — Winston Churchill (attribution discutée)",
  'N\'attendez pas. Le moment ne sera jamais parfaitement choisi. — Napoleon Hill',
  'Faites ce que vous pouvez, avec ce que vous avez, là où vous êtes. — Theodore Roosevelt',
  "Tout ce que vous avez toujours voulu est de l'autre côté de la peur. — George Addair",
  'Le courage commence par le fait de se présenter et de se montrer. — Brené Brown',
  'Le secret pour avancer est de commencer. — Mark Twain (attribution discutée)',
  "N'ayez pas peur de faire un grand pas si c'est nécessaire. — David Lloyd George",
  // Proverbes et sagesse populaire
  'Celui qui veut atteindre la montagne commence par gravir la première colline. — Proverbe populaire',
  'L\'arbre qui tombe fait plus de bruit que la forêt qui pousse. — Proverbe populaire',
  'Quand on veut, on peut. — Proverbe populaire',
  'À quelque chose malheur est bon. — Proverbe français',
  'Il n\'est jamais trop tard pour bien faire. — Proverbe français',
  "La valeur n'attend pas le nombre des années. — Pierre Corneille",
  "Après l'effort, le réconfort. — Proverbe populaire",
];

// ── Encouragements de fin de liste — phrases originales Tumaa ───────────────────
export const CLOSING_ENCOURAGEMENT_VARIANTS: string[] = [
  'Ton prochain emploi existe peut-être déjà. Continue de le chercher.',
  "Un refus n'est pas la fin. C'est une candidature de moins à attendre.",
  'Ne cherche pas seulement un emploi. Cherche ta prochaine opportunité.',
  'Aujourd\'hui, une offre. Demain, peut-être ton nouveau départ.',
  "Continue. Ton opportunité peut arriver là où tu ne l'attends pas.",
  'Chaque candidature te rapproche de la bonne réponse.',
  'Ton CV mérite une chance. Ne cesse pas de la chercher.',
  "Une porte peut se fermer. Continue d'en chercher une autre.",
  'La recherche peut être longue. Ton objectif, lui, reste le même.',
  'Ne laisse pas un refus décider de ton avenir.',
  "Ton prochain chapitre professionnel n'est pas encore écrit.",
  "Aujourd'hui tu cherches. Demain, quelqu'un cherchera peut-être ton profil.",
  'Tu n\'as pas encore trouvé. Cela ne veut pas dire que tu ne trouveras pas.',
  "Une journée sans réponse n'est pas une journée sans progrès.",
  'Ton prochain oui peut se cacher derrière plusieurs non.',
  'Ne mesure pas ton avenir au nombre de refus reçus.',
  'Chaque matin est une nouvelle occasion de trouver ton opportunité.',
  "Ce n'est peut-être pas aujourd'hui. Mais continue d'avancer vers ce jour.",
  'Même quand rien ne bouge, continue de chercher.',
  "Ton parcours n'est pas défini par les portes qui se sont fermées.",
  "Il suffit parfois d'une seule opportunité pour changer une trajectoire.",
  "Garde espoir. La bonne offre n'est peut-être pas encore publiée.",
  "Chaque offre consultée t'apprend un peu plus ce que tu recherches.",
  'Chaque candidature est une nouvelle possibilité.',
  "Ne te décourage pas parce que ton CV n'a pas encore été choisi.",
  "Continue à postuler. Ton profil peut être celui qu'un recruteur attend aujourd'hui.",
  "Ta recherche d'emploi est un marathon, pas une course de quelques mètres.",
  "Une candidature envoyée aujourd'hui peut devenir une opportunité demain.",
  'Chercher un emploi demande du temps. Trouver le bon peut en valoir la peine.',
  "Ne cherche pas la perfection. Cherche l'opportunité qui peut te faire avancer.",
  'Ton expérience a de la valeur. Continue à la présenter au bon endroit.',
  "Le bon poste n'est pas toujours le premier que tu rencontres.",
  'Un "non" aujourd\'hui ne prédit pas ton "oui" de demain.',
  "Ils ont refusé ta candidature. Ils n'ont pas refusé ton avenir.",
  'Un recruteur peut dire non à ton profil. La prochaine entreprise peut dire oui.',
  'Ne transforme pas un refus professionnel en doute personnel.',
  "Ce poste n'était peut-être pas le tien. Continue à chercher celui qui l'est.",
  'Un refus ferme une possibilité. Il ne ferme pas toutes les possibilités.',
  'Tu peux être déçu sans abandonner.',
  "Prends le refus comme une étape, pas comme une destination.",
  "Ton CV peut être refusé. Ta détermination, elle, ne devrait pas l'être.",
  'Le prochain recruteur ne connaît pas les refus du précédent.',
  "Continue de chercher. Continue d'apprendre. Continue d'avancer.",
  "Une opportunité ne prévient pas toujours avant d'arriver. Reste prêt.",
  'Mets ton profil devant les bonnes personnes. Une opportunité peut commencer par là.',
  "Aujourd'hui peut être le jour où quelqu'un découvre ton profil.",
  'Ne laisse pas une mauvaise journée arrêter une bonne recherche.',
  'Chaque nouvelle offre est une nouvelle possibilité à explorer.',
  "Ton rôle aujourd'hui est simple : continuer à avancer.",
  'Tu ne contrôles pas la réponse du recruteur. Tu contrôles ta prochaine candidature.',
  'Cherche encore. Postule encore. Avance encore.',
  'Ton opportunité mérite que tu lui donnes une chance de te trouver.',
  "Ton histoire professionnelle ne s'arrête pas à ton dernier emploi.",
  "Ce que tu cherches aujourd'hui peut devenir le début d'une nouvelle histoire.",
  "Ton avenir professionnel ne se décide pas sur une seule candidature.",
  "Tu n'as pas besoin de trouver toutes les réponses aujourd'hui. Commence par la prochaine opportunité.",
  'Continue à croire en ton parcours, même quand la recherche devient difficile.',
  "Il y aura peut-être des jours sans réponse. Mais ne laisse pas ces jours devenir des jours sans espoir.",
  "Un nouveau travail peut commencer par une simple offre que tu décides de regarder.",
  'Continue. Cherche. Postule. Ton prochain chapitre peut commencer avec une seule opportunité.',
  'Ne baisse pas les bras. Ton opportunité peut être dans la prochaine offre. 🚀',
];
