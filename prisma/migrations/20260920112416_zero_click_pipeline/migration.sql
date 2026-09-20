-- AlterTable
ALTER TABLE "ProductRequirement" ADD COLUMN     "searchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "constructionYear" INTEGER,
ADD COLUMN     "heatingType" TEXT,
ADD COLUMN     "importantFacts" TEXT,
ADD COLUMN     "monthlyCosts" DOUBLE PRECISION,
ADD COLUMN     "repairFund" DOUBLE PRECISION,
ADD COLUMN     "usableAreaM2" DOUBLE PRECISION;
