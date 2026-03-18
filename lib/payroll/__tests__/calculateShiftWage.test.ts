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
    shiftType: "NORMAL",
    googleEventId: null,
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
    perLessonWage: new Prisma.Decimal(2000),
    holidayHourlyWage: new Prisma.Decimal(1200),
    nightMultiplier: new Prisma.Decimal(1.25),
    overtimeMultiplier: new Prisma.Decimal(1.5),
    nightStart: time("22:00"),
    nightEnd: time("05:00"),
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
      dayWage: 7700,
      overtimeWage: 0,
      nightWage: 0,
      workHours: 7,
      overtimeHours: 0,
      nightHours: 0,
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
      totalWage: 9750,
      dayWage: 7800,
      overtimeWage: 0,
      nightWage: 1950,
      workHours: 6.5,
      overtimeHours: 0,
      nightHours: 6.5,
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

    expect(result.totalWage).toBe(14300);
    expect(result.dayWage).toBe(11000);
    expect(result.overtimeWage).toBe(3300);
    expect(result.overtimeHours).toBe(2);
  });

  it("LESSON型シフトではエラーを返す", () => {
    const shift = createShift({ shiftType: "LESSON" });
    const rule = createRule();

    expect(() => calculateOtherShiftWage(shift, rule)).toThrow(
      "calculateOtherShiftWage は LESSON 型シフトを扱えません",
    );
  });
});
