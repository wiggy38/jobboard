-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "fraudConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobSubmission" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "ScoutPayment" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoutPayment_scoutId_idx" ON "ScoutPayment"("scoutId");

-- CreateIndex
CREATE INDEX "ScoutPayment_month_idx" ON "ScoutPayment"("month");

-- CreateIndex
CREATE INDEX "JobSubmission_scoutId_idx" ON "JobSubmission"("scoutId");

-- AddForeignKey
ALTER TABLE "JobSubmission" ADD CONSTRAINT "JobSubmission_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "Scout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSubmission" ADD CONSTRAINT "JobSubmission_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutPayment" ADD CONSTRAINT "ScoutPayment_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "Scout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
