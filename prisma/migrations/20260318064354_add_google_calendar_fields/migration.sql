-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "googleSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "googleTokenExpiresAt" TIMESTAMP(3);
