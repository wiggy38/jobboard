// Paramètres métier éditables en backoffice — clés, types et valeurs par
// défaut. Ce fichier est la source de vérité pour la FORME de chaque
// paramètre ; les valeurs elles-mêmes vivent en base (table Setting, voir
// packages/db/prisma/schema.prisma) et retombent sur DEFAULT_SETTINGS quand
// la ligne n'existe pas encore (première utilisation, pays pas encore
// configuré, etc).
//
// packages/shared reste sans dépendance : chaque app (api/bot/scraper)
// possède son propre accesseur getSetting()/setSetting() (lib/settings.ts)
// qui lit la table Setting via son propre PrismaClient et retombe sur
// DEFAULT_SETTINGS[key] en cas d'absence.

import { PLAN_LIMITS, type PlanLimits, type UserPlan } from './planLimits'
import { CITY_OPTIONS, LEVEL_OPTIONS, SECTOR_OPTIONS, type ProfileOption } from './profileOptions'

export const SETTING_KEYS = {
  SCRAPER_ALERT_THRESHOLD: 'scraper.alertThreshold',
  SCRAPER_RETRY_ATTEMPTS: 'scraper.retryAttempts',
  SCRAPER_SCHEDULE: 'scraper.schedule',
  SCRAPER_REPORT_EMAIL_TO: 'scraper.reportEmailTo',
  SCRAPER_CAREERJET_AFFID: 'scraper.careerjetAffid',
  TEMPLATE_CAPS: 'templates.caps',
  PULL_BATCH_SIZE: 'pull.batchSize',
  PLAN_LIMITS: 'plans.limits',
  REFERENCE_LEVELS: 'reference.levels',
  REFERENCE_SECTORS: 'reference.sectors',
  REFERENCE_CITIES_BY_COUNTRY: 'reference.citiesByCountry',
  CHANNEL_INVITE_LINKS: 'channels.inviteLinks',
  WHATSAPP_BOT_NUMBERS: 'whatsapp.botNumbers',
  SCOUTS_CAPTURE_RATE: 'scouts.captureRate',
  PAYMENTS_PAYDUNYA_MODE: 'payments.paydunyaMode',
  PLAN_PRICING: 'plans.pricing',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export interface ScraperScheduleEntry {
  name: string
  scraperKey: string
  pattern: string
  // Code ISO du pays desservi par ce scraper (apps/scraper/src/sources/**/*.ts
  // — voir convention multi-pays dans .claude/CLAUDE.md). Optionnel pour la
  // rétro-compatibilité avec des lignes `Setting` déjà en base ; les entrées
  // sans `country` sont traitées comme 'BF' côté backoffice.
  country?: string
}

export interface ScraperRegistryEntry {
  key: string
  country: string
}

// Miroir des clés du registre apps/scraper/src/sources/index.ts (Map<string,
// BaseScraper>) et du pays statique de chaque scraper — sert à peupler le
// sélecteur "Ajouter un scraper" de /admin/parametres sans laisser un admin
// taper une scraperKey libre (risque de typo = job silencieusement inerte,
// scheduler.ts ignore les clés inconnues du registre). À tenir synchronisé
// manuellement si un scraper est ajouté/retiré du registre.
export const SCRAPER_REGISTRY: ScraperRegistryEntry[] = [
  { key: 'lefaso', country: 'BF' },
  { key: 'reliefweb', country: 'BF' },
  { key: 'anpe-bf', country: 'BF' },
  { key: 'emploiburkina', country: 'BF' },
  { key: 'criburkina', country: 'BF' },
  { key: 'emploi-lefaso', country: 'BF' },
  { key: 'bfemploi', country: 'BF' },
  { key: 'icipe', country: 'BF' },
  { key: 'professionnallink', country: 'BF' },
  { key: 'afriqueemplois', country: 'BF' },
  { key: 'goafricaonline', country: 'BF' },
  { key: 'linkedin', country: 'BF' },
  { key: 'sidwaya', country: 'BF' },
  { key: 'faso7', country: 'BF' },
  { key: 'talentsplusafrique', country: 'BF' },
  { key: 'offresdemplois-bj', country: 'BJ' },
  { key: 'careerjet-bj', country: 'BJ' },
  { key: 'gouvbj', country: 'BJ' },
  { key: 'afriqueemplois-bj', country: 'BJ' },
  { key: 'emploibougebenin', country: 'BJ' },
  { key: 'jobbenin', country: 'BJ' },
  { key: 'anpe-bj', country: 'BJ' },
  { key: 'unjobs', country: 'BJ' },
  { key: 'novojob', country: 'BJ' },
  { key: 'bjemploi', country: 'BJ' },
  { key: 'africarrieres', country: 'BJ' },
  { key: 'wabajob', country: 'BJ' },
  { key: 'finexconsulting', country: 'BJ' },
  { key: 'coinafrique', country: 'BJ' },
  { key: 'emploiaubenin', country: 'BJ' },
]

export type TemplateType = 'RELANCE' | 'MATCH_PARFAIT' | 'NUDGE_PREMIUM' | 'DAILY_DIGEST'

export interface TemplateCaps {
  RELANCE: number
  MATCH_PARFAIT: number
  NUDGE_PREMIUM: number
  // Plafond partagé marketing (RELANCE/MATCH_PARFAIT/NUDGE_PREMIUM uniquement) — DAILY_DIGEST
  // (catégorie Meta UTILITY, PREMIUM/ELITE) a son propre plafond indépendant, voir DAILY_DIGEST
  // ci-dessous et apps/bot/src/counters/templateCounter.ts.
  GLOBAL_CAP: number
  DAILY_DIGEST: number
}

export type PaydunyaMode = 'test' | 'live'

export interface PlanPricing {
  // Prix affiché biffé à des fins marketing — n'est jamais facturé.
  barredPrice: number
  // Prix réel, envoyé tel quel à PayDunya (createInvoice) — seule valeur qui compte pour le paiement.
  price: number
}

export interface SettingValueMap {
  [SETTING_KEYS.SCRAPER_ALERT_THRESHOLD]: number
  [SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS]: number
  [SETTING_KEYS.SCRAPER_SCHEDULE]: ScraperScheduleEntry[]
  [SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO]: string
  [SETTING_KEYS.SCRAPER_CAREERJET_AFFID]: string
  [SETTING_KEYS.TEMPLATE_CAPS]: TemplateCaps
  [SETTING_KEYS.PULL_BATCH_SIZE]: number
  [SETTING_KEYS.PLAN_LIMITS]: Record<UserPlan, PlanLimits>
  [SETTING_KEYS.REFERENCE_LEVELS]: ProfileOption[]
  [SETTING_KEYS.REFERENCE_SECTORS]: ProfileOption[]
  [SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY]: Record<string, ProfileOption[]>
  [SETTING_KEYS.CHANNEL_INVITE_LINKS]: Record<string, string>
  [SETTING_KEYS.WHATSAPP_BOT_NUMBERS]: Record<string, string>
  [SETTING_KEYS.SCOUTS_CAPTURE_RATE]: number
  [SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE]: PaydunyaMode
  [SETTING_KEYS.PLAN_PRICING]: Record<'PREMIUM' | 'ELITE', PlanPricing>
}

// Vague unique quotidienne à partir de 23h00, décalée de 5 min entre chaque
// source (23h00→00h05) — sert de valeur de repli tant qu'aucun admin n'a
// modifié la programmation depuis le backoffice. Remplace l'ancienne
// répartition en deux vagues (12h/22h).
const DEFAULT_SCRAPER_SCHEDULE: ScraperScheduleEntry[] = [
  { name: 'lefaso-daily', scraperKey: 'lefaso', pattern: '0 23 * * *', country: 'BF' },
  { name: 'reliefweb-daily', scraperKey: 'reliefweb', pattern: '5 23 * * *', country: 'BF' },
  { name: 'anpe-daily', scraperKey: 'anpe-bf', pattern: '10 23 * * *', country: 'BF' },
  { name: 'bfemploi-daily', scraperKey: 'bfemploi', pattern: '15 23 * * *', country: 'BF' },
  { name: 'icipe-daily', scraperKey: 'icipe', pattern: '20 23 * * *', country: 'BF' },
  { name: 'professionnallink-daily', scraperKey: 'professionnallink', pattern: '25 23 * * *', country: 'BF' },
  { name: 'afriqueemplois-daily', scraperKey: 'afriqueemplois', pattern: '30 23 * * *', country: 'BF' },
  { name: 'emploiburkina-daily', scraperKey: 'emploiburkina', pattern: '35 23 * * *', country: 'BF' },
  { name: 'criburkina-daily', scraperKey: 'criburkina', pattern: '40 23 * * *', country: 'BF' },
  { name: 'emploi-lefaso-daily', scraperKey: 'emploi-lefaso', pattern: '45 23 * * *', country: 'BF' },
  { name: 'goafricaonline-daily', scraperKey: 'goafricaonline', pattern: '50 23 * * *', country: 'BF' },
  { name: 'linkedin-daily', scraperKey: 'linkedin', pattern: '55 23 * * *', country: 'BF' },
  { name: 'sidwaya-daily', scraperKey: 'sidwaya', pattern: '0 0 * * *', country: 'BF' },
  { name: 'faso7-daily', scraperKey: 'faso7', pattern: '5 0 * * *', country: 'BF' },
]

// Pays desservis par un canal WhatsApp national (voir .claude/CLAUDE.md) —
// amorce les référentiels par pays. Les autres pays partent avec une liste
// vide, éditable en backoffice au fur et à mesure de l'expansion.
const SUPPORTED_COUNTRIES = ['BF', 'BJ', 'TG', 'CI', 'SN']

export const DEFAULT_SETTINGS: SettingValueMap = {
  [SETTING_KEYS.SCRAPER_ALERT_THRESHOLD]: 3,
  [SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS]: 3,
  [SETTING_KEYS.SCRAPER_SCHEDULE]: DEFAULT_SCRAPER_SCHEDULE,
  [SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO]: 'm.miguellao@gmail.com',
  [SETTING_KEYS.SCRAPER_CAREERJET_AFFID]: '',
  [SETTING_KEYS.TEMPLATE_CAPS]: {
    RELANCE: 2,
    MATCH_PARFAIT: 1,
    NUDGE_PREMIUM: 1,
    GLOBAL_CAP: 3,
    DAILY_DIGEST: 31,
  },
  [SETTING_KEYS.PULL_BATCH_SIZE]: 10,
  [SETTING_KEYS.PLAN_LIMITS]: PLAN_LIMITS,
  [SETTING_KEYS.REFERENCE_LEVELS]: LEVEL_OPTIONS,
  [SETTING_KEYS.REFERENCE_SECTORS]: SECTOR_OPTIONS,
  [SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY]: Object.fromEntries(
    SUPPORTED_COUNTRIES.map((c) => [c, c === 'BF' ? CITY_OPTIONS : []])
  ),
  [SETTING_KEYS.CHANNEL_INVITE_LINKS]: {},
  [SETTING_KEYS.WHATSAPP_BOT_NUMBERS]: { BF: '22667735146' },
  [SETTING_KEYS.SCOUTS_CAPTURE_RATE]: 200,
  [SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE]: 'live',
  [SETTING_KEYS.PLAN_PRICING]: {
    PREMIUM: { barredPrice: 650, price: 650 },
    ELITE: { barredPrice: 1250, price: 1250 },
  },
}
