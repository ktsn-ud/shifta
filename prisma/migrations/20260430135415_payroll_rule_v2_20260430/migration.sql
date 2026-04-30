/*
  Warnings:

  - You are about to drop the column `holidayHourlyWage` on the `PayrollRule` table. All the data in the column will be lost.
  - You are about to drop the column `nightEnd` on the `PayrollRule` table. All the data in the column will be lost.
  - You are about to drop the column `nightMultiplier` on the `PayrollRule` table. All the data in the column will be lost.
  - You are about to drop the column `nightStart` on the `PayrollRule` table. All the data in the column will be lost.
  - You are about to drop the column `overtimeMultiplier` on the `PayrollRule` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PayrollRule" DROP COLUMN "holidayHourlyWage",
DROP COLUMN "nightEnd",
DROP COLUMN "nightMultiplier",
DROP COLUMN "nightStart",
DROP COLUMN "overtimeMultiplier",
ADD COLUMN     "holidayAllowanceHourly" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nightPremiumRate" DECIMAL(4,2) NOT NULL DEFAULT 0.25,
ADD COLUMN     "overtimePremiumRate" DECIMAL(4,2) NOT NULL DEFAULT 0.25;
