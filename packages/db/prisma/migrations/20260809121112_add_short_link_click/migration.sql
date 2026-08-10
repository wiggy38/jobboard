-- CreateTable
CREATE TABLE "ShortLinkClick" (
    "id" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShortLinkClick_shortLinkId_idx" ON "ShortLinkClick"("shortLinkId");

-- CreateIndex
CREATE INDEX "ShortLinkClick_createdAt_idx" ON "ShortLinkClick"("createdAt");

-- AddForeignKey
ALTER TABLE "ShortLinkClick" ADD CONSTRAINT "ShortLinkClick_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "ShortLink"("code") ON DELETE CASCADE ON UPDATE CASCADE;
