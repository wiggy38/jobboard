-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'BF';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'BF';

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'BF';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'BF';
