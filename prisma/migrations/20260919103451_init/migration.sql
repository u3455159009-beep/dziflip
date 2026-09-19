-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "sourceText" TEXT,
    "portal" TEXT,
    "title" TEXT,
    "askingPrice" DOUBLE PRECISION,
    "disposition" TEXT,
    "areaM2" DOUBLE PRECISION,
    "pricePerM2" DOUBLE PRECISION,
    "municipality" TEXT,
    "district" TEXT,
    "street" TEXT,
    "floor" TEXT,
    "totalFloors" TEXT,
    "buildingType" TEXT,
    "construction" TEXT,
    "ownership" TEXT,
    "condition" TEXT,
    "buildingCondition" TEXT,
    "penb" TEXT,
    "balcony" BOOLEAN,
    "terrace" BOOLEAN,
    "loggia" BOOLEAN,
    "cellar" BOOLEAN,
    "parking" BOOLEAN,
    "elevator" BOOLEAN,
    "orientation" TEXT,
    "legalNotes" TEXT,
    "fullText" TEXT,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "fieldMeta" TEXT,
    "fieldSource" TEXT,
    "targetPrice" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "sourceWatcherId" TEXT,
    "analysisStage" TEXT NOT NULL DEFAULT 'FULL_ANALYSIS',

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "agency" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEKONTAKTOVANO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "mode" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watcher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "municipality" TEXT,
    "district" TEXT,
    "dispositions" TEXT,
    "minAreaM2" DOUBLE PRECISION,
    "maxAreaM2" DOUBLE PRECISION,
    "maxAskingPrice" DOUBLE PRECISION,
    "maxPricePerM2" DOUBLE PRECISION,
    "condition" TEXT,
    "ownership" TEXT,
    "minProfit" DOUBLE PRECISION,
    "minRoiPct" DOUBLE PRECISION,
    "maxRenovationEstimate" DOUBLE PRECISION,
    "requiredReserve" DOUBLE PRECISION,
    "onlyNewListings" BOOLEAN NOT NULL DEFAULT false,
    "trackPriceChanges" BOOLEAN NOT NULL DEFAULT true,
    "sources" TEXT NOT NULL DEFAULT 'MOCK_DEMO',
    "lastRunAt" TIMESTAMP(3),
    "lastRunNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "watcherId" TEXT,
    "reason" TEXT NOT NULL,
    "band" TEXT,
    "askingPrice" DOUBLE PRECISION,
    "pricePerM2" DOUBLE PRECISION,
    "expectedProfit" DOUBLE PRECISION,
    "roiPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "alertId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultMinProfit" DOUBLE PRECISION,
    "defaultMinRoiPct" DOUBLE PRECISION,
    "defaultReserve" DOUBLE PRECISION,
    "defaultRenovationCostPerM2" DOUBLE PRECISION,
    "preferredLocalities" TEXT,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmailAddress" TEXT,
    "contactAutomationMode" TEXT NOT NULL DEFAULT 'DRAFT',
    "contactAutomationConfirmedAt" TIMESTAMP(3),
    "dailyContactLimit" INTEGER NOT NULL DEFAULT 5,
    "defaultTemplateId" TEXT,
    "smsAutomationMode" TEXT NOT NULL DEFAULT 'DRAFT',
    "smsAutomationConfirmedAt" TIMESTAMP(3),
    "maxAutoSmsPerDay" INTEGER NOT NULL DEFAULT 3,
    "smsAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultSmsTemplateId" TEXT,
    "showDemoData" BOOLEAN NOT NULL DEFAULT true,
    "minCompCount" INTEGER NOT NULL DEFAULT 3,
    "minCompQuality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "maxCompDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "maxCompAgeDays" INTEGER NOT NULL DEFAULT 180,
    "aiPhotoAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
    "staleDataThresholdDays" INTEGER NOT NULL DEFAULT 14,
    "shoppingReferenceLocality" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INTRO',
    "mode" TEXT,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK_SMS',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "providerMessageId" TEXT,
    "blockedReason" TEXT,
    "classification" TEXT,
    "suggestedDateTimeRaw" TEXT,
    "suggestedDateTime" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsBlacklist" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsAuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "phone" TEXT,
    "step" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoListing" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "portal" TEXT NOT NULL DEFAULT 'DEMO',
    "title" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "district" TEXT,
    "disposition" TEXT NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL,
    "ownership" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "room" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomType" TEXT,
    "currentCondition" TEXT,
    "visibleIssues" TEXT,
    "keepNotes" TEXT,
    "removeNotes" TEXT,
    "replaceNotes" TEXT,
    "renovationSuggestions" TEXT,
    "analysisConfidence" TEXT,
    "analysisSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoGeneration" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "prompt" TEXT,
    "generatedUrl" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "PhotoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "portal" TEXT,
    "locality" TEXT,
    "disposition" TEXT,
    "areaM2" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "pricePerM2" DOUBLE PRECISION,
    "condition" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "priceType" TEXT NOT NULL DEFAULT 'ASKING',
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownership" TEXT,
    "floor" TEXT,
    "totalFloors" TEXT,
    "elevator" BOOLEAN,
    "balcony" BOOLEAN,
    "terrace" BOOLEAN,
    "loggia" BOOLEAN,
    "parking" BOOLEAN,
    "buildingType" TEXT,
    "construction" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "similarityBreakdown" TEXT,
    "qualityTier" TEXT,

    CONSTRAINT "Comparable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "room" TEXT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "laborEstimate" DOUBLE PRECISION,
    "materialEstimate" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "priceSource" TEXT NOT NULL DEFAULT 'ESTIMATE',
    "productUrl" TEXT,
    "shop" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productRequirementId" TEXT,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "detail" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PossibleDuplicate" (
    "id" TEXT NOT NULL,
    "projectAId" TEXT NOT NULL,
    "projectBId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "resolvedStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PossibleDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomCondition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "room" TEXT,
    "category" TEXT NOT NULL,
    "shoppingCategory" TEXT NOT NULL DEFAULT 'OSTATNI',
    "description" TEXT NOT NULL,
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "dimensions" TEXT,
    "style" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantityNeeded" DOUBLE PRECISION,
    "quantityUnit" TEXT,
    "reservePct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "status" TEXT NOT NULL DEFAULT 'NEEDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productRequirementId" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PROVIDER',
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "retailer" TEXT,
    "price" DOUBLE PRECISION,
    "originalPrice" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "unit" TEXT,
    "packSize" DOUBLE PRECISION,
    "packUnit" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "tier" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBranch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "stockStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "stockQty" INTEGER,
    "personalPickup" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "availability" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderErrorLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "watcherId" TEXT,
    "externalId" TEXT,
    "errorMessage" TEXT NOT NULL,
    "retryStatus" TEXT NOT NULL DEFAULT 'NONE',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumptions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "purchasePriceUsed" DOUBLE PRECISION,
    "saleConservative" DOUBLE PRECISION,
    "saleBase" DOUBLE PRECISION,
    "saleOptimistic" DOUBLE PRECISION,
    "renovationCost" DOUBLE PRECISION,
    "furnishingCost" DOUBLE PRECISION,
    "legalCosts" DOUBLE PRECISION,
    "financingCost" DOUBLE PRECISION,
    "otherCosts" DOUBLE PRECISION,
    "reserve" DOUBLE PRECISION,
    "minProfit" DOUBLE PRECISION,
    "minMarginPct" DOUBLE PRECISION,
    "minRoiPct" DOUBLE PRECISION,
    "incomeTaxPct" DOUBLE PRECISION,
    "bandWidthPct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_portal_externalId_key" ON "Project"("portal", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_projectId_key" ON "Contact"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsBlacklist_phone_key" ON "SmsBlacklist"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "DemoListing_externalId_key" ON "DemoListing"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_productRequirementId_key" ON "BudgetItem"("productRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "PossibleDuplicate_projectAId_projectBId_key" ON "PossibleDuplicate"("projectAId", "projectBId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomCondition_projectId_room_element_key" ON "RoomCondition"("projectId", "room", "element");

-- CreateIndex
CREATE UNIQUE INDEX "Assumptions_projectId_key" ON "Assumptions"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_sourceWatcherId_fkey" FOREIGN KEY ("sourceWatcherId") REFERENCES "Watcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "Watcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsAuditLog" ADD CONSTRAINT "SmsAuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoGeneration" ADD CONSTRAINT "PhotoGeneration_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparable" ADD CONSTRAINT "Comparable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_productRequirementId_fkey" FOREIGN KEY ("productRequirementId") REFERENCES "ProductRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PossibleDuplicate" ADD CONSTRAINT "PossibleDuplicate_projectAId_fkey" FOREIGN KEY ("projectAId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PossibleDuplicate" ADD CONSTRAINT "PossibleDuplicate_projectBId_fkey" FOREIGN KEY ("projectBId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCondition" ADD CONSTRAINT "RoomCondition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRequirement" ADD CONSTRAINT "ProductRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productRequirementId_fkey" FOREIGN KEY ("productRequirementId") REFERENCES "ProductRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranch" ADD CONSTRAINT "ProductBranch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumptions" ADD CONSTRAINT "Assumptions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
