// Miroir des enums Prisma (packages/db/prisma/schema.prisma)
export type ContractType = 'CDI' | 'CDD' | 'STAGE' | 'ALTERNANCE' | 'FREELANCE' | 'BENEVOLE' | 'AUTRE';
export type JobOfferStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
export type TemplateType = 'RELANCE' | 'MATCH_PARFAIT' | 'NUDGE_PREMIUM';
export type UserPlan = 'FREEMIUM' | 'PREMIUM';

export interface JobOffer {
  id: string;
  title: string;
  organization: string;
  city: string;
  sector: string;
  level: string;
  contractType: ContractType;
  deadline: string | null;
  isSponsored: boolean;
  scoreConfidence: number;
  status: JobOfferStatus;
  publishedAt?: string | null;
  description?: string | null;
  applicationUrl?: string | null;
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
}

export type TemplateDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface ScraperStatus {
  id: string;
  name: string;
  type: string;
  lastCrawl: string | null;
  newOffers: number;
  consecutiveErrors: number;
  status: 'ok' | 'warn' | 'error';
  errorMessage?: string;
}

export interface PipelineResult {
  scraperName: string;
  totalScraped: number;
  totalInserted: number;
  totalDuplicates: number;
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

export interface TokenizedOffer extends JobOffer {
  isUnlocked: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  requirements: string | null;
  sourceUrl: string;
  source: {
    id: string;
    name: string;
    trustScore: number;
    type: string;
  } | null;
}
