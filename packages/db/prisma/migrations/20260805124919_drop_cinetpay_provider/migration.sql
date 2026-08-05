-- Drop the CINETPAY value from PaymentProvider (CinetPay integration abandoned in favor of PayDunya).
-- Postgres has no direct DROP VALUE for enums, so recreate the type without it.
BEGIN;
CREATE TYPE "PaymentProvider_new" AS ENUM ('ORANGE_MONEY', 'MOOV_MONEY', 'CORIS_MONEY', 'CARTE_BANCAIRE', 'REVENDEUR', 'PAYDUNYA');
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "PaymentProvider_old";
COMMIT;
