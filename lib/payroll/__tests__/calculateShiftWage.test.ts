import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { calculateOtherShiftWage } from "@/lib/payroll/calculateShiftWage";

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function createShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: date("2026-03-20"),
    startTime: time("10:00"),
    endTime: time("18:00"),
    breakMinutes: 60,
    isConfirmed: false,
    shiftType: "NORMAL",
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
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
    holidayAllowanceHourly: new Prisma.Decimal(300),
    nightPremiumRate: new Prisma.Decimal(0.25),
    overtimePremiumRate: new Prisma.Decimal(0.25),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "WEEKEND",
    ...overrides,
  };
}

describe("calculateOtherShiftWage", () => {
  it("例1: 通常勤務の給与を計算できる", () => {
    const shift = createShift();
    const rule = createRule();

    const result = calculateOtherShiftWage(shift, rule);

    expect(result).toEqual({
      totalWage: 7700,
      baseWage: 7700,
      holidayWage: 0,
      overtimeWage: 0,
      nightWage: 0,
      workHours: 7,
      baseHours: 7,
      holidayHours: 0,
      overtimeHours: 0,
      nightHours: 0,
      dayWage: 7700,
    });
  });

  it("例2: 夜勤シフトの給与を計算できる", () => {
    const shift = createShift({
      date: date("2026-03-21"),
      startTime: time("22:00"),
      endTime: time("05:00"),
      breakMinutes: 30,
      shiftType: "NORMAL",
    });
    const rule = createRule();

    const result = calculateOtherShiftWage(shift, rule);

    expect(result).toEqual({
      totalWage: 10888,
      baseWage: 0,
      holidayWage: 1950,
      overtimeWage: 0,
      nightWage: 8938,
      workHours: 6.5,
      baseHours: 0,
      holidayHours: 6.5,
      overtimeHours: 0,
      nightHours: 6.5,
      dayWage: 0,
    });
  });

  it("残業時間がある場合は残業給を加算する", () => {
    const shift = createShift({
      startTime: time("09:00"),
      endTime: time("19:00"),
      breakMinutes: 0,
    });
    const rule = createRule({
      holidayType: "NONE",
    });

    const result = calculateOtherShiftWage(shift, rule);

    expect(result.totalWage).toBe(11000);
    expect(result.baseWage).toBe(11000);
    expect(result.holidayWage).toBe(0);
    expect(result.dayWage).toBe(11000);
    expect(result.overtimeWage).toBe(0);
    expect(result.overtimeHours).toBe(2);
  });

  it("HOLIDAY の場合は平日祝日でも休日時給を適用する", () => {
    const shift = createShift({
      date: date("2026-02-11"),
    });
    const rule = createRule({
      holidayType: "HOLIDAY",
    });

    const result = calculateOtherShiftWage(shift, rule);

    expect(result.totalWage).toBe(9800);
    expect(result.baseWage).toBe(7700);
    expect(result.holidayWage).toBe(2100);
    expect(result.dayWage).toBe(7700);
    expect(result.overtimeWage).toBe(0);
    expect(result.nightWage).toBe(0);
  });

  it("LESSON型シフトでも時給ベースで計算できる", () => {
    const shift = createShift({ shiftType: "LESSON" });
    const rule = createRule();

    const result = calculateOtherShiftWage(shift, rule);

    expect(result).toEqual({
      totalWage: 7700,
      baseWage: 7700,
      holidayWage: 0,
      overtimeWage: 0,
      nightWage: 0,
      workHours: 7,
      baseHours: 7,
      holidayHours: 0,
      overtimeHours: 0,
      nightHours: 0,
      dayWage: 7700,
    });
  });
});
