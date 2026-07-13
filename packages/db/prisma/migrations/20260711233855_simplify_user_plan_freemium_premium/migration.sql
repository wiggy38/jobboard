-- AlterEnum
BEGIN;
CREATE TYPE "UserPlan_new" AS ENUM ('FREEMIUM', 'PREMIUM');
ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "plan" TYPE "UserPlan_new" USING ("plan"::text::"UserPlan_new");
ALTER TABLE "Payment" ALTER COLUMN "planPurchased" TYPE "UserPlan_new" USING ("planPurchased"::text::"UserPlan_new");
ALTER TYPE "UserPlan" RENAME TO "UserPlan_old";
ALTER TYPE "UserPlan_new" RENAME TO "UserPlan";
DROP TYPE "UserPlan_old";
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREEMIUM';
COMMIT;

-- DropForeignKey
ALTER TABLE "FamilyGroup" DROP CONSTRAINT "FamilyGroup_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_familyGroupId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "familyGroupId";

-- DropTable
DROP TABLE "FamilyGroup";
