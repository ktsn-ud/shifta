-- DropIndex
DROP INDEX "Shift_workplaceId_date_idx";

-- CreateIndex
CREATE INDEX "Account_userId_provider_idx" ON "Account"("userId", "provider");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Shift_workplaceId_date_startTime_idx" ON "Shift"("workplaceId", "date", "startTime");

-- CreateIndex
CREATE INDEX "Shift_workplaceId_isConfirmed_date_startTime_idx" ON "Shift"("workplaceId", "isConfirmed", "date", "startTime");

-- CreateIndex
CREATE INDEX "Workplace_userId_createdAt_idx" ON "Workplace"("userId", "createdAt");
