export type AccessLevel = 'FULL' | 'PREVIEW'

export type JobPublic = {
  id: string
  title: string
  organization: string | null
  city: string
  sector: string
  level: string | null
  contractType: string
  deadline: string | null
  description: string | null
  requirements: string | null
  contactEmail: string | null
  contactPhone: string | null
  contactAddress: string | null
  applicationUrl: string | null
  sourceUrl: string | null
  sourceName: string | null
  status: string
}

export type OffreApiResponse = {
  job: JobPublic
  accessLevel: AccessLevel
}

export type OffreApiError = {
  error: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'JOB_NOT_FOUND' | 'JOB_INACTIVE'
  message: string
}
