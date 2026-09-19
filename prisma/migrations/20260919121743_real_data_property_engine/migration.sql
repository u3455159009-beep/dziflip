-- AlterTable
ALTER TABLE "Comparable" ADD COLUMN     "isOutlier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "outlierReason" TEXT,
ADD COLUMN     "sourceProvider" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "accessRoad" TEXT,
ADD COLUMN     "airConditioning" BOOLEAN,
ADD COLUMN     "buildable" BOOLEAN,
ADD COLUMN     "comparableDiscoveryNote" TEXT,
ADD COLUMN     "discoveredListingConfidence" TEXT,
ADD COLUMN     "discoveredListingReasons" TEXT,
ADD COLUMN     "discoveredListingUrl" TEXT,
ADD COLUMN     "electricalRewiring" BOOLEAN,
ADD COLUMN     "garageDimensions" TEXT,
ADD COLUMN     "garageElectricity" BOOLEAN,
ADD COLUMN     "garageLandOwnership" TEXT,
ADD COLUMN     "garageRentNote" TEXT,
ADD COLUMN     "insulationYear" INTEGER,
ADD COLUMN     "landAreaM2" DOUBLE PRECISION,
ADD COLUMN     "landRestrictions" TEXT,
ADD COLUMN     "lastComparableDiscoveryAt" TIMESTAMP(3),
ADD COLUMN     "masonryCore" BOOLEAN,
ADD COLUMN     "propertyType" TEXT,
ADD COLUMN     "risersYear" INTEGER,
ADD COLUMN     "roofYear" INTEGER,
ADD COLUMN     "structuresOnLand" TEXT,
ADD COLUMN     "utilitiesAvailable" TEXT,
ADD COLUMN     "windowsReplacedYear" INTEGER,
ADD COLUMN     "zoning" TEXT;

-- CreateTable
CREATE TABLE "ComparablePriceHistory" (
    "id" TEXT NOT NULL,
    "comparableId" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparablePriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comparable_projectId_url_key" ON "Comparable"("projectId", "url");

-- AddForeignKey
ALTER TABLE "ComparablePriceHistory" ADD CONSTRAINT "ComparablePriceHistory_comparableId_fkey" FOREIGN KEY ("comparableId") REFERENCES "Comparable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

