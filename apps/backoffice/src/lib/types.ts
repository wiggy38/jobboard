// Miroir des enums Prisma (packages/db/prisma/schema.prisma)
export type ContractType = 'CDI' | 'CDD' | 'STAGE' | 'ALTERNANCE' | 'FREELANCE' | 'BENEVOLE' | 'AUTRE';
export type JobOfferStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
export type TemplateType = 'RELANCE' | 'MATCH_PARFAIT' | 'NUDGE_PREMIUM';
export type UserPlan = 'FREEMIUM' | 'PREMIUM' | 'ELITE';
export type UserStatus = 'ACTIVE' | 'PAUSED' | 'DORMANT' | 'STOPPED';

export interface JobOffer {
  id: string;
  title: string;
  organization: string;
  city: string;
  country: string;
  sector: string;
  level: string;
  contractType: ContractType;
  deadline: string | null;
  isSponsored: boolean;
  isFeatured: boolean;
  scoreConfidence: number;
  status: JobOfferStatus;
  publishedAt?: string | null;
  description?: string | null;
  applicationUrl?: string | null;
  views?: number;
  clicks?: number;
}

export interface EmployerStats {
  totalViews: number;
  profilesReached: number;
  contactClicks: number;
}

export interface AdminJobOfferDetail extends JobOffer {
  level: string;
  description: string | null;
  requirements: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  applicationUrl: string | null;
  sourceUrl: string;
  hash: string;
  validated: boolean;
  ttlDays: number;
  isFraudSuspect: boolean;
  createdAt: string;
  updatedAt: string;
  source: {
    id: string;
    name: string;
    url: string;
    type: string;
    trustScore: number;
  };
  interactions: Record<string, number>;
}

export interface OfferInteractionEvent {
  action: 'SEEN' | 'CLICKED_SOURCE' | 'SHARED' | 'UNLOCKED' | 'BOOKMARKED' | 'REPORTED_FRAUD';
  createdAt: string;
  user: { id: string; phone: string; displayName: string | null };
}

export interface PaginatedOfferInteractions {
  data: OfferInteractionEvent[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface AdminStats {
  activeUsers: number;
  tpqToday: number;
  totalOffers: number;
  pendingOffers: number;
  activeOffers: number;
  expiredOffers: number;
  archivedOffers: number;
  offersInsertedToday: number;
  templatesSentThisMonth: number;
  templateBudgetCap: number;
  offersDailyHistory: { date: string; count: number }[];
  tpqHistory: { date: string; count: number }[];
}

export type TemplateDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface ScraperStatus {
  id: string;
  name: string;
  type: string;
  country: string;
  lastCrawl: string | null;
  newOffers: number;
  consecutiveErrors: number;
  status: 'ok' | 'warn' | 'error';
  errorMessage?: string;
}

export interface ScraperRun {
  id: string;
  status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
  totalScraped: number;
  totalInserted: number;
  totalDuplicates: number;
  totalExpired: number;
  totalErrors: number;
  duration: number;
  errorMessage: string | null;
  startedAt: string;
}

export interface ScraperRunHistory {
  source: { id: string; name: string };
  runs: ScraperRun[];
}

export interface PipelineResult {
  scraperName: string;
  totalScraped: number;
  totalInserted: number;
  totalDuplicates: number;
  totalExpired: number;
  totalErrors: number;
  duration: number;
}

export interface JobPollResult {
  state: 'active' | 'waiting' | 'delayed' | 'completed' | 'failed' | 'unknown';
  result: PipelineResult | null;
  failedReason: string | null;
}

export interface SyncAllResult {
  ok: boolean;
  count: number;
  jobs: { scraperName: string; jobId: string }[];
}

export interface TemplateLog {
  id: string;
  phoneNumber: string;
  type: TemplateType;
  sentAt: string;
  status: TemplateDeliveryStatus;
}

export interface TemplateUsage {
  type: TemplateType;
  used: number;
  cap: number;
}

export interface Employer {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string | null;
  isVerified: boolean;
  plan?: string | null;
  planEndAt?: string | null;
  slotsLeft?: number | null;
}

export interface EmployerOffer extends JobOffer {
  publishedAt: string | null;
  expiresAt?: string | null;
  profilesReached: number;
  contactClicks: number;
}

export interface PaginatedOffers {
  offers: JobOffer[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface SourceAlert {
  id: string;
  name: string;
  crawlErrors: number;
  lastCrawled: string | null;
  reason: string;
}

export interface HealthCheckResult {
  alerts: SourceAlert[];
  checkedAt: string;
}

export interface Scout {
  id: string;
  name: string;
  phone: string;
  zone: string;
  isActive: boolean;
  totalCaptures: number;
  totalEarned: number;
  createdAt: string;
  submissionsThisMonth?: number;
  validatedThisMonth?: number;
  pendingCount?: number;
  earnings?: { thisMonth: number; total: number };
}

export interface AdminScoutDetail extends Scout {
  updatedAt: string;
  submissions: {
    id: string;
    title: string;
    organization: string;
    city: string;
    createdAt: string;
    status: string;
  }[];
  payments: {
    id: string;
    month: string;
    amount: number;
    paidAt: string;
  }[];
}

export interface AdminUserChannelJoin {
  country: string;
  invitedAt: string;
  joined: boolean;
  joinedAt: string | null;
}

export interface AdminUser {
  id: string;
  phone: string;
  displayName: string | null;
  plan: UserPlan;
  status: UserStatus;
  countries: string[];
  planStartAt: string | null;
  planEndAt: string | null;
  createdAt: string;
  channelJoins: AdminUserChannelJoin[];
}

export interface AdminUserDetail extends AdminUser {
  trialUsed: boolean;
  referralCode: string;
  referralCredits: number;
  updatedAt: string;
  profile: {
    cities: string[];
    sectors: string[];
    levels: string[];
    contractTypes: string[];
    keywords: string[];
    country: string;
    language: string;
  } | null;
  payments: {
    id: string;
    amount: number;
    provider: string;
    status: string;
    planPurchased: UserPlan;
    durationDays: number;
    createdAt: string;
  }[];
}

export interface PaginatedUsers {
  data: AdminUser[];
  total: number;
}

export interface AdminUserPullActivity {
  id: string;
  phone: string;
  displayName: string | null;
  plan: UserPlan;
  status: UserStatus;
  countries: string[];
  createdAt: string;
  pullDaysCount: number;
  offersReceived: number;
  lastPullDate: string | null;
}

export interface PaginatedPullActivity {
  data: AdminUserPullActivity[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  period: { from: string; to: string };
}

export interface TrackingEvent {
  id: string;
  action: 'SEEN' | 'CLICKED_SOURCE';
  createdAt: string;
  job: { id: string; title: string; organization: string };
  user: { id: string; phone: string; displayName: string | null };
}

export interface PaginatedTracking {
  data: TrackingEvent[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  period: { from: string; to: string };
  summary: { views: number; clicks: number; clickRate: number };
}

export interface PullDeliveryOffer {
  id: string;
  title: string;
  organization: string;
  city: string;
  sector: string;
  contractType: ContractType;
  status: JobOfferStatus;
  seenAt: string | null;
  sourceClickedAt: string | null;
}

export interface PullDelivery {
  id: string;
  command: 'OFFRES' | 'SUITE';
  offersCount: number;
  createdAt: string;
  offers: PullDeliveryOffer[];
}

export interface PaginatedPullHistory {
  data: PullDelivery[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// Comptes backoffice (staff interne) — distinct de AdminUser (abonné WhatsApp bot)
export type AdminAccountRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR';

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AdminAccountRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TokenizedOffer extends JobOffer {
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  requirements: string | null;
  sourceUrl: string;
  sourceName: string | null;
  sourceTrustScore: number;
}
