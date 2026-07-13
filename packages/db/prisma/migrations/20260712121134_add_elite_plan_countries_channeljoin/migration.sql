-- AlterEnum
ALTER TYPE "UserPlan" ADD VALUE 'ELITE';

-- AlterTable: replace singular `country` with `countries` array, preserving existing values
ALTER TABLE "User" ADD COLUMN "countries" TEXT[] DEFAULT ARRAY['BF']::TEXT[];
UPDATE "User" SET "countries" = ARRAY["country"]::TEXT[] WHERE "country" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "country";

-- CreateTable
CREATE TABLE "ChannelJoin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelJoin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelJoin_userId_idx" ON "ChannelJoin"("userId");

-- CreateIndex
CREATE INDEX "ChannelJoin_country_idx" ON "ChannelJoin"("country");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelJoin_userId_country_key" ON "ChannelJoin"("userId", "country");

-- AddForeignKey
ALTER TABLE "ChannelJoin" ADD CONSTRAINT "ChannelJoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
