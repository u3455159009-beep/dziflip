-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "arvEstimate" DOUBLE PRECISION,
ADD COLUMN     "dziflipScore" INTEGER,
ADD COLUMN     "marketValueEstimate" DOUBLE PRECISION,
ADD COLUMN     "renovationEstimate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "crossPortalListings" TEXT,
ADD COLUMN     "listingAvailability" TEXT NOT NULL DEFAULT 'LISTED',
ADD COLUMN     "listingMissedRuns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "listingRelistedAt" TIMESTAMP(3),
ADD COLUMN     "listingRemovedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProviderErrorLog" ADD COLUMN     "latencyMs" INTEGER;

-- CreateTable
CREATE TABLE "ProviderSuccessLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resultCount" INTEGER,
    "latencyMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSuccessLog_pkey" PRIMARY KEY ("id")
);
