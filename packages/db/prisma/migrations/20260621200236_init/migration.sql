-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('FREEMIUM', 'ESSENTIEL', 'PRO', 'FAMILLE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DORMANT', 'STOPPED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'FREELANCE', 'BENEVOLE', 'AUTRE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('INSTITUTIONNEL', 'MEDIA_LOCAL', 'ONG', 'JOBBOARD', 'ENTREPRISE', 'RESEAU_SOCIAL', 'SCOUT', 'B2B_DIRECT', 'API');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ORANGE_MONEY', 'MOOV_MONEY', 'CORIS_MONEY', 'CARTE_BANCAIRE', 'REVENDEUR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('RELANCE', 'MATCH_PARFAIT', 'NUDGE_PREMIUM');

-- CreateEnum
CREATE TYPE "JobOfferStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT,
    "plan" "UserPlan" NOT NULL DEFAULT 'FREEMIUM',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "planStartAt" TIMESTAMP(3),
    "planEndAt" TIMESTAMP(3),
    "trialUsed" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "referralCredits" INTEGER NOT NULL DEFAULT 0,
    "familyGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cities" TEXT[],
    "sectors" TEXT[],
    "levels" TEXT[],
    "contractTypes" "ContractType"[],
    "keywords" TEXT[],
    "notificationTime" TEXT NOT NULL DEFAULT '08:00',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "maxSize" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastCrawled" TIMESTAMP(3),
    "crawlErrors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactAddress" TEXT,
    "applicationUrl" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "hash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "status" "JobOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "ttlDays" INTEGER NOT NULL DEFAULT 30,
    "scoreConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isFraudSuspect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "reference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "planPurchased" "UserPlan" NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "templateType" "TemplateType",
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "plan" TEXT,
    "planEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSubmission" (
    "id" TEXT NOT NULL,
    "employerId" TEXT,
    "scoutId" TEXT,
    "rawData" JSONB NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "jobOfferId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "JobSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scout" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalCaptures" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_plan_status_idx" ON "User"("plan", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyGroup_ownerId_key" ON "FamilyGroup"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_url_key" ON "Source"("url");

-- CreateIndex
CREATE UNIQUE INDEX "JobOffer_hash_key" ON "JobOffer"("hash");

-- CreateIndex
CREATE INDEX "JobOffer_city_sector_status_idx" ON "JobOffer"("city", "sector", "status");

-- CreateIndex
CREATE INDEX "JobOffer_deadline_idx" ON "JobOffer"("deadline");

-- CreateIndex
CREATE INDEX "JobOffer_hash_idx" ON "JobOffer"("hash");

-- CreateIndex
CREATE INDEX "JobOffer_sourceId_idx" ON "JobOffer"("sourceId");

-- CreateIndex
CREATE INDEX "JobOffer_status_idx" ON "JobOffer"("status");

-- CreateIndex
CREATE INDEX "JobInteraction_userId_idx" ON "JobInteraction"("userId");

-- CreateIndex
CREATE INDEX "JobInteraction_jobId_idx" ON "JobInteraction"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobInteraction_userId_jobId_action_key" ON "JobInteraction"("userId", "jobId", "action");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "TemplateCounter_userId_month_idx" ON "TemplateCounter"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateCounter_userId_month_type_key" ON "TemplateCounter"("userId", "month", "type");

-- CreateIndex
CREATE INDEX "Notification_userId_sentAt_idx" ON "Notification"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "Notification_isPaid_idx" ON "Notification"("isPaid");

-- CreateIndex
CREATE INDEX "PullEvent_date_idx" ON "PullEvent"("date");

-- CreateIndex
CREATE INDEX "PullEvent_userId_idx" ON "PullEvent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PullEvent_userId_date_key" ON "PullEvent"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JobSubmission_jobOfferId_key" ON "JobSubmission"("jobOfferId");

-- CreateIndex
CREATE INDEX "JobSubmission_isVerified_idx" ON "JobSubmission"("isVerified");

-- CreateIndex
CREATE INDEX "JobSubmission_employerId_idx" ON "JobSubmission"("employerId");

-- CreateIndex
CREATE UNIQUE INDEX "Scout_phone_key" ON "Scout"("phone");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyGroup" ADD CONSTRAINT "FamilyGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInteraction" ADD CONSTRAINT "JobInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInteraction" ADD CONSTRAINT "JobInteraction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateCounter" ADD CONSTRAINT "TemplateCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullEvent" ADD CONSTRAINT "PullEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSubmission" ADD CONSTRAINT "JobSubmission_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
