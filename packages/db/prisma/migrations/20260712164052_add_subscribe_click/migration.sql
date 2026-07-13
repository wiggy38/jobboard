-- CreateTable
CREATE TABLE "SubscribeClick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "UserPlan",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscribeClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscribeClick_userId_createdAt_idx" ON "SubscribeClick"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscribeClick" ADD CONSTRAINT "SubscribeClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
