-- CreateTable
CREATE TABLE "UnknownCommandLog" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnknownCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnknownCommandLog_createdAt_idx" ON "UnknownCommandLog"("createdAt");

-- CreateIndex
CREATE INDEX "UnknownCommandLog_phoneNumber_idx" ON "UnknownCommandLog"("phoneNumber");
