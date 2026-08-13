-- AlterTable
ALTER TABLE "BookProject" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BookProject_shareToken_key" ON "BookProject"("shareToken");
