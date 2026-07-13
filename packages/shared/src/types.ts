export interface RawJobOffer {
  title: string
  organization: string
  city: string
  country?: string
  sector?: string
  level?: string
  contractType?: string
  description?: string
  requirements?: string
  contactEmail?: string
  contactPhone?: string
  contactAddress?: string
  applicationUrl?: string
  sourceUrl: string
  publishedAt?: Date
  deadline?: Date
  isSponsored?: boolean
  isFraudSuspect?: boolean
}

export interface ScraperResult {
  source: string
  offers: RawJobOffer[]
  errors: string[]
  scrapedAt: Date
}

export interface NormalizedJobOffer extends RawJobOffer {
  sector: string
  level: string
  contractType: string
  city: string
  country: string
  hash: string
  scoreConfidence: number
}
