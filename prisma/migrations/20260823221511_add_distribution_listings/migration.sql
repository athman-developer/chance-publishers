-- CreateEnum
CREATE TYPE "DistributionPlatform" AS ENUM ('AMAZON_KDP', 'GOOGLE_PLAY_BOOKS', 'OTHER');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('NOT_STARTED', 'AUTHOR_INVITED_ADMIN', 'ADMIN_ACCESS_CONFIRMED', 'UPLOADED', 'LIVE');

-- CreateTable
CREATE TABLE "DistributionListing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "DistributionPlatform" NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "listingUrl" TEXT,
    "asin" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionListing_projectId_platform_key" ON "DistributionListing"("projectId", "platform");

-- AddForeignKey
ALTER TABLE "DistributionListing" ADD CONSTRAINT "DistributionListing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BookProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
