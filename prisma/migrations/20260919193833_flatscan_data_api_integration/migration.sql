-- AlterTable
ALTER TABLE "Comparable" ADD COLUMN     "daysOnMarket" INTEGER,
ADD COLUMN     "discountPercent" DOUBLE PRECISION,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "discoveredListingExternalId" TEXT,
ADD COLUMN     "discoveredListingProvider" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "flatScanCacheTtlHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "FlatScanListingCache" (
    "id" TEXT NOT NULL,
    "flatScanId" TEXT NOT NULL,
    "portal" TEXT,
    "url" TEXT,
    "name" TEXT,
    "disposition" TEXT,
    "areaM2" DOUBLE PRECISION,
    "municipality" TEXT,
    "locality" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "priceOriginal" DOUBLE PRECISION,
    "priceCurrent" DOUBLE PRECISION,
    "pricePerM2" DOUBLE PRECISION,
    "currentPricePerM2" DOUBLE PRECISION,
    "onRequest" BOOLEAN NOT NULL DEFAULT false,
    "seller" TEXT,
    "daysOnMarket" INTEGER,
    "discountPercent" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceDeletedAt" TIMESTAMP(3),
    "condition" TEXT,
    "construction" TEXT,
    "floor" TEXT,
    "totalFloors" TEXT,
    "elevator" BOOLEAN,
    "balcony" BOOLEAN,
    "terrace" BOOLEAN,
    "loggia" BOOLEAN,
    "parking" BOOLEAN,
    "ownership" TEXT,
    "rawJson" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlatScanListingCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatScanPriceHistoryCache" (
    "id" TEXT NOT NULL,
    "listingCacheId" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlatScanPriceHistoryCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatScanSearchCache" (
    "id" TEXT NOT NULL,
    "querySignature" TEXT NOT NULL,
    "flatScanIds" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlatScanSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatScanLocalityStats" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "municipality" TEXT,
    "district" TEXT,
    "medianPricePerM2" DOUBLE PRECISION,
    "avgPricePerM2" DOUBLE PRECISION,
    "activeListingCount" INTEGER,
    "trendPct" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlatScanLocalityStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatScanRequestLog" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlatScanRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlatScanListingCache_flatScanId_key" ON "FlatScanListingCache"("flatScanId");

-- CreateIndex
CREATE UNIQUE INDEX "FlatScanSearchCache_querySignature_key" ON "FlatScanSearchCache"("querySignature");

-- CreateIndex
CREATE UNIQUE INDEX "FlatScanLocalityStats_key_key" ON "FlatScanLocalityStats"("key");

-- AddForeignKey
ALTER TABLE "FlatScanPriceHistoryCache" ADD CONSTRAINT "FlatScanPriceHistoryCache_listingCacheId_fkey" FOREIGN KEY ("listingCacheId") REFERENCES "FlatScanListingCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

