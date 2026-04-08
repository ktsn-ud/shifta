import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
} from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { calculateLessonShiftWage } from "@/lib/payroll/calculateLessonShiftWage";

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function createShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-lesson-1",
    workplaceId: "workplace-1",
    date: date("2026-03-22"),
    startTime: time("16:30"),
    endTime: time("19:50"),
    breakMinutes: 0,
    isConfirmed: false,
    shiftType: "LESSON",
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
    ...overrides,
  };
}

function createLessonRange(
  overrides: Partial<ShiftLessonRange> = {},
): ShiftLessonRange {
  return {
    id: "lesson-range-1",
    shiftId: "shift-lesson-1",
    timetableSetId: "set-1",
    startPeriod: 1,
    endPeriod: 3,
    ...overrides,
  };
}

function createRule(overrides: Partial<PayrollRule> = {}): PayrollRule {
  return {
    id: "rule-1",
    workplaceId: "workplace-1",
    startDate: date("2026-01-01"),
    endDate: null,
    baseHourlyWage: new Prisma.Decimal(1100),
    holidayHourlyWage: new Prisma.Decimal(1200),
    nightMultiplier: new Prisma.Decimal(1.0),
    overtimeMultiplier: new Prisma.Decimal(1.0),
    nightStart: time("22:00"),
    nightEnd: time("05:00"),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "NONE",
    ...overrides,
  };
}

describe("calculateLessonShiftWage", () => {
  it("例3: LESSON型シフトの給与を計算できる", () => {
    const shift = createShift();
    const lessonRange = createLessonRange();
    const rule = createRule();

    const result = calculateLessonShiftWage(shift, lessonRange, rule);

    expect(result).toEqual({
      totalWage: 3667,
      dayWage: 3667,
      overtimeWage: 0,
      nightWage: 0,
      workHours: 3.33,
      overtimeHours: 0,
      nightHours: 0,
      lessonCount: 3,
    });
  });

  it("LESSON型以外ではエラーを返す", () => {
    const shift = createShift({ shiftType: "NORMAL" });
    const lessonRange = createLessonRange();
    const rule = createRule();

    expect(() => calculateLessonShiftWage(shift, lessonRange, rule)).toThrow(
      "calculateLessonShiftWage は LESSON 型シフト専用です",
    );
  });

  it("startPeriod > endPeriod の場合はエラーを返す", () => {
    const shift = createShift();
    const lessonRange = createLessonRange({ startPeriod: 4, endPeriod: 3 });
    const rule = createRule();

    expect(() => calculateLessonShiftWage(shift, lessonRange, rule)).toThrow(
      "startPeriod は endPeriod 以下である必要があります",
    );
  });
});
