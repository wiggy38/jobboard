-- CreateTable
CREATE TABLE "PullDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "offersCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PullDeliveryOffers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "PullDelivery_userId_createdAt_idx" ON "PullDelivery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_PullDeliveryOffers_AB_unique" ON "_PullDeliveryOffers"("A", "B");

-- CreateIndex
CREATE INDEX "_PullDeliveryOffers_B_index" ON "_PullDeliveryOffers"("B");

-- AddForeignKey
ALTER TABLE "PullDelivery" ADD CONSTRAINT "PullDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PullDeliveryOffers" ADD CONSTRAINT "_PullDeliveryOffers_A_fkey" FOREIGN KEY ("A") REFERENCES "JobOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PullDeliveryOffers" ADD CONSTRAINT "_PullDeliveryOffers_B_fkey" FOREIGN KEY ("B") REFERENCES "PullDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
