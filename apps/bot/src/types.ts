// Message entrant WhatsApp (extrait du payload Meta)
export type WhatsAppMessage = {
  from: string;       // Numéro E.164 ex: +22670000001
  body: string;       // Texte brut du message
  messageId: string;  // wamid.xxx — ID unique Meta
};

// Commandes reconnues par le parser
export type CommandName =
  | 'OFFRES' | 'VOIR' | 'STOP' | 'AIDE'
  | 'ESSAI' | 'PREMIUM' | 'PARRAINER'
  | 'MODIFIER' | 'REVOIR' | 'PAUSE'
  | 'STATS' | 'ALERTE' | 'UNKNOWN';

export type ParsedCommand = {
  command: CommandName;
  args?: string[]; // ex. ['COMPTABLE'] pour "ALERTE COMPTABLE"
};

// Contexte complet disponible dans chaque handler
export type BotContext = {
  message: WhatsAppMessage;
  parsed: ParsedCommand;
  userId: string;        // UUID Prisma de l'utilisateur
  userPlan: string;      // 'FREEMIUM' | 'PREMIUM'
  userStatus: string;    // 'ACTIVE' | 'PAUSED' | 'DORMANT' | 'STOPPED'
  windowOpen: boolean;   // true = fenêtre service 24h Redis active
};
