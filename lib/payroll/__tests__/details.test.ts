import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
} from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { summarizeWorkplacePayrollDetailsByPeriod } from "@/lib/payroll/details";

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function createShift(
  overrides: Partial<Shift> = {},
  lessonRange: ShiftLessonRange | null = null,
): Shift & { lessonRange: ShiftLessonRange | null } {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: date("2026-04-20"),
    startTime: time("10:00"),
    endTime: time("18:00"),
    breakMinutes: 60,
    isConfirmed: false,
    shiftType: "NORMAL",
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: date("2026-04-20"),
    lessonRange,
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
    holidayHourlyWage: new Prisma.Decimal(1500),
    nightMultiplier: new Prisma.Decimal(1.25),
    overtimeMultiplier: new Prisma.Decimal(1.5),
    nightStart: time("22:00"),
    nightEnd: time("05:00"),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "WEEKEND",
    ...overrides,
  };
}

describe("summarizeWorkplacePayrollDetailsByPeriod", () => {
  it("基本/休日/深夜/残業の内訳と時間表示を算出できる", () => {
    const shifts = [
      createShift({
        id: "weekday-1",
        date: date("2026-04-20"),
        startTime: time("10:00"),
        endTime: time("18:00"),
        breakMinutes: 60,
      }),
      createShift({
        id: "holiday-1",
        date: date("2026-04-19"),
        startTime: time("09:00"),
        endTime: time("15:00"),
        breakMinutes: 0,
      }),
      createShift({
        id: "night-overtime-1",
        date: date("2026-04-21"),
        startTime: time("20:00"),
        endTime: time("06:00"),
        breakMinutes: 60,
      }),
      createShift({
        id: "outside-period",
        date: date("2026-05-01"),
        startTime: time("10:00"),
        endTime: time("12:00"),
        breakMinutes: 0,
      }),
    ];

    const result = summarizeWorkplacePayrollDetailsByPeriod({
      workplaceId: "workplace-1",
      startDate: date("2026-04-01"),
      endDate: date("2026-04-30"),
      shifts,
      payrollRules: [createRule()],
    });

    expect(result).toEqual({
      totalWorkHours: 22,
      baseHours: 16,
      holidayHours: 6,
      nightHours: 7,
      overtimeHours: 1,
      totalWage: 30175,
      baseWage: 17600,
      holidayWage: 9000,
      nightWage: 1925,
      overtimeWage: 1650,
      workDuration: "22:00",
      baseDuration: "16:00",
      holidayDuration: "6:00",
      nightDuration: "7:00",
      overtimeDuration: "1:00",
      effectiveBaseHourlyWage: 1100,
      effectiveHolidayHourlyWage: 1500,
      effectiveNightHourlyWage: 1100,
      effectiveOvertimeHourlyWage: 1100,
      effectiveNightPremiumRate: 0.25,
      effectiveOvertimeMultiplier: 1.5,
    });
  });

  it("対象シフトが0件のときは0とnullで返す", () => {
    const result = summarizeWorkplacePayrollDetailsByPeriod({
      workplaceId: "workplace-1",
      startDate: date("2026-04-01"),
      endDate: date("2026-04-30"),
      shifts: [],
      payrollRules: [createRule()],
    });

    expect(result).toEqual({
      totalWorkHours: 0,
      baseHours: 0,
      holidayHours: 0,
      nightHours: 0,
      overtimeHours: 0,
      totalWage: 0,
      baseWage: 0,
      holidayWage: 0,
      nightWage: 0,
      overtimeWage: 0,
      workDuration: "0:00",
      baseDuration: "0:00",
      holidayDuration: "0:00",
      nightDuration: "0:00",
      overtimeDuration: "0:00",
      effectiveBaseHourlyWage: null,
      effectiveHolidayHourlyWage: null,
      effectiveNightHourlyWage: null,
      effectiveOvertimeHourlyWage: null,
      effectiveNightPremiumRate: null,
      effectiveOvertimeMultiplier: null,
    });
  });
});
