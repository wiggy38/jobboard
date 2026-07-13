import { JobOffer, PrismaClient, UserPlan } from '@prisma/client';
import {
  matchJobsAboveThreshold,
  ContractType as MatchingContractType,
  UserPlan as MatchingPlan,
  UserProfile,
} from '@tumaa/matching';

export const MATCH_SCORE_THRESHOLD = 60;

type ProfileLike = {
  cities: string[];
  sectors: string[];
  levels: string[];
  contractTypes: string[];
  keywords: string[];
} | null;

export async function getMatchedOffers(
  db: PrismaClient,
  userId: string,
  plan: UserPlan,
  profile: ProfileLike,
  countries: string[],
): Promise<JobOffer[]> {
  const matchingProfile: UserProfile = {
    userId,
    cities: profile?.cities ?? [],
    sectors: profile?.sectors ?? [],
    levels: profile?.levels ?? [],
    contractTypes: (profile?.contractTypes ?? []) as unknown as MatchingContractType[],
    keywords: profile?.keywords ?? [],
    plan: MatchingPlan[plan as keyof typeof MatchingPlan],
  };

  const prismaOffers = await db.jobOffer.findMany({
    where: { status: 'ACTIVE', country: { in: countries } },
  });

  const matchResults = matchJobsAboveThreshold(
    prismaOffers.map((o) => ({
      id: o.id,
      title: o.title,
      organization: o.organization,
      city: o.city,
      sector: o.sector,
      level: o.level,
      contractType: o.contractType as unknown as import('@tumaa/matching').ContractType,
      keywords: [],
      publishedAt: o.publishedAt ?? new Date(),
      scoreConfidence: o.scoreConfidence,
      isSponsored: o.isSponsored,
    })),
    matchingProfile,
    MATCH_SCORE_THRESHOLD,
  );

  const offerMap = new Map(prismaOffers.map((o) => [o.id, o]));
  return matchResults.map((r) => offerMap.get(r.jobId)!).filter(Boolean);
}
