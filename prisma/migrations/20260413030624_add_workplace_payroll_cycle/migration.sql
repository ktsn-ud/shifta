-- CreateEnum
CREATE TYPE "ClosingDayType" AS ENUM ('DAY_OF_MONTH', 'END_OF_MONTH');

-- AlterTable
ALTER TABLE "Workplace" ADD COLUMN     "closingDay" INTEGER,
ADD COLUMN     "closingDayType" "ClosingDayType" NOT NULL DEFAULT 'END_OF_MONTH',
ADD COLUMN     "payday" INTEGER NOT NULL DEFAULT 25;
