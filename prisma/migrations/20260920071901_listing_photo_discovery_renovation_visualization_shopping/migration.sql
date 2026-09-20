-- AlterTable
ALTER TABLE "Assumptions" ADD COLUMN     "maxRenovationBudgetOverride" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BudgetItem" ADD COLUMN     "deliveryEstimate" DOUBLE PRECISION,
ADD COLUMN     "wasteEstimate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "elementDetails" TEXT,
ADD COLUMN     "matchConfidence" TEXT,
ADD COLUMN     "retrievedAt" TIMESTAMP(3),
ADD COLUMN     "sourceListingExternalId" TEXT,
ADD COLUMN     "sourceListingProvider" TEXT,
ADD COLUMN     "sourceListingUrl" TEXT,
ADD COLUMN     "sourcePhotoProvider" TEXT;

-- AlterTable
ALTER TABLE "PhotoGeneration" ADD COLUMN     "changeDetection" TEXT,
ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "estimatedRoomCost" DOUBLE PRECISION,
ADD COLUMN     "renovationPlanId" TEXT,
ADD COLUMN     "requiresTechnicalReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "structuralChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "structuralChangeNote" TEXT;

-- AlterTable
ALTER TABLE "ProductRequirement" ADD COLUMN     "sourcePhotoGenerationId" TEXT,
ADD COLUMN     "usedInVisualization" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "discoveredListingCandidatePhotos" TEXT,
ADD COLUMN     "discoveredListingPhotosConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RenovationPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "style" TEXT,
    "priceLevel" TEXT,
    "flooring" TEXT,
    "wallColor" TEXT,
    "doors" TEXT,
    "handles" TEXT,
    "outletsSwitches" TEXT,
    "lighting" TEXT,
    "kitchen" TEXT,
    "bathroomFixtures" TEXT,
    "tiles" TEXT,
    "sanitary" TEXT,
    "builtIns" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenovationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenovationPlan_projectId_key" ON "RenovationPlan"("projectId");

-- AddForeignKey
ALTER TABLE "PhotoGeneration" ADD CONSTRAINT "PhotoGeneration_renovationPlanId_fkey" FOREIGN KEY ("renovationPlanId") REFERENCES "RenovationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenovationPlan" ADD CONSTRAINT "RenovationPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
