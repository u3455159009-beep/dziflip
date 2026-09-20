-- AlterTable
ALTER TABLE "PhotoGeneration" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "requestSignature" TEXT;
