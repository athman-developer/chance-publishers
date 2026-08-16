-- CreateEnum
CREATE TYPE "EmployeePayoutMethod" AS ENUM ('MPESA', 'BANK');

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "mpesaNumber" TEXT,
ADD COLUMN     "payoutMethod" "EmployeePayoutMethod";
