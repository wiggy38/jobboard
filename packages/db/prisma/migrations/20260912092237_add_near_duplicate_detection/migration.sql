-- AlterTable
ALTER TABLE "ScraperRun" ADD COLUMN     "totalNearDuplicates" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "JobOffer_country_deadline_idx" ON "JobOffer"("country", "deadline");
