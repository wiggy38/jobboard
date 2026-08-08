-- CreateTable
CREATE TABLE "ShortLink" (
    "code" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "ShortLink_jobId_idx" ON "ShortLink"("jobId");

-- CreateIndex
CREATE INDEX "ShortLink_referrerId_idx" ON "ShortLink"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_jobId_referrerId_key" ON "ShortLink"("jobId", "referrerId");

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
