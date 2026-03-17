-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('GENERAL', 'CRAM_SCHOOL');

-- CreateEnum
CREATE TYPE "TimetableType" AS ENUM ('NORMAL', 'INTENSIVE');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('NORMAL', 'LESSON', 'OTHER');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NONE', 'WEEKEND', 'HOLIDAY', 'WEEKEND_HOLIDAY');

-- CreateTable
CREATE TABLE "Workplace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkplaceType" NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRule" (
    "id" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "baseHourlyWage" DECIMAL(10,2) NOT NULL,
    "perLessonWage" DECIMAL(10,2),
    "holidayHourlyWage" DECIMAL(10,2),
    "nightMultiplier" DECIMAL(4,2) NOT NULL,
    "overtimeMultiplier" DECIMAL(4,2) NOT NULL,
    "nightStart" TIME(0) NOT NULL,
    "nightEnd" TIME(0) NOT NULL,
    "dailyOvertimeThreshold" DECIMAL(5,2) NOT NULL,
    "holidayType" "HolidayType" NOT NULL,

    CONSTRAINT "PayrollRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timetable" (
    "id" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "type" "TimetableType" NOT NULL,
    "period" INTEGER NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,

    CONSTRAINT "Timetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftType" "ShiftType" NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftLessonRange" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "endPeriod" INTEGER NOT NULL,

    CONSTRAINT "ShiftLessonRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workplace_userId_idx" ON "Workplace"("userId");

-- CreateIndex
CREATE INDEX "PayrollRule_workplaceId_idx" ON "PayrollRule"("workplaceId");

-- CreateIndex
CREATE INDEX "PayrollRule_workplaceId_startDate_endDate_idx" ON "PayrollRule"("workplaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Timetable_workplaceId_idx" ON "Timetable"("workplaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Timetable_workplaceId_type_period_key" ON "Timetable"("workplaceId", "type", "period");

-- CreateIndex
CREATE INDEX "Shift_workplaceId_date_idx" ON "Shift"("workplaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftLessonRange_shiftId_key" ON "ShiftLessonRange"("shiftId");

-- AddForeignKey
ALTER TABLE "Workplace" ADD CONSTRAINT "Workplace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRule" ADD CONSTRAINT "PayrollRule_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLessonRange" ADD CONSTRAINT "ShiftLessonRange_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
