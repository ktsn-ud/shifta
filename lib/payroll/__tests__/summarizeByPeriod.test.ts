import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  summarizeByPeriod,
  type ShiftWithSummaryRelations,
} from "@/lib/payroll/summarizeByPeriod";

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function createRule(overrides: Partial<PayrollRule> = {}): PayrollRule {
  return {
    id: "rule-1",
    workplaceId: "workplace-1",
    startDate: date("2026-01-01"),
    endDate: null,
    baseHourlyWage: new Prisma.Decimal(1100),
    holidayHourlyWage: new Prisma.Decimal(300),
    nightMultiplier: new Prisma.Decimal(0.25),
    overtimeMultiplier: new Prisma.Decimal(0.25),
    nightStart: time("22:00"),
    nightEnd: time("05:00"),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "WEEKEND",
    ...overrides,
  };
}

function createShift(
  overrides: Partial<Shift> = {},
): ShiftWithSummaryRelations {
  const base: Shift = {
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
    createdAt: date("2026-03-20"),
  };

  return {
    ...base,
    ...overrides,
    lessonRange: null,
    workplace: {
      id: overrides.workplaceId ?? base.workplaceId,
      name: "勤務先A",
      color: "#FF5733",
    },
  };
}

describe("summarizeByPeriod", () => {
  it("NORMAL/LESSONを含む期間集計と勤務先別内訳を返す", () => {
    const rules = [
      createRule({ workplaceId: "workplace-1" }),
      createRule({
        id: "rule-2",
        workplaceId: "workplace-2",
        baseHourlyWage: new Prisma.Decimal(1000),
        holidayHourlyWage: new Prisma.Decimal(0),
        nightMultiplier: new Prisma.Decimal(0),
        overtimeMultiplier: new Prisma.Decimal(0),
        dailyOvertimeThreshold: new Prisma.Decimal(8),
        holidayType: "NONE",
      }),
    ];
    const shifts: ShiftWithSummaryRelations[] = [
      createShift(),
      createShift({
        id: "shift-2",
        date: date("2026-03-21"),
        startTime: time("22:00"),
        endTime: time("05:00"),
        breakMinutes: 30,
      }),
      {
        ...createShift({
          id: "shift-3",
          workplaceId: "workplace-2",
          date: date("2026-03-22"),
          shiftType: "LESSON",
          startTime: time("16:30"),
          endTime: time("19:50"),
          breakMinutes: 0,
        }),
        workplace: {
          id: "workplace-2",
          name: "勤務先B",
          color: "#3366FF",
        },
        lessonRange: {
          id: "range-1",
          shiftId: "shift-3",
          timetableSetId: "set-2",
          startPeriod: 1,
          endPeriod: 3,
        },
      },
    ];

    const result = summarizeByPeriod(
      shifts,
      rules,
      date("2026-03-01"),
      date("2026-03-31"),
    );

    expect(result).toEqual({
      totalWage: 21921,
      totalWorkHours: 16.83,
      totalNightHours: 6.5,
      totalOvertimeHours: 0,
      byWorkplace: [
        {
          workplaceId: "workplace-1",
          workplaceName: "勤務先A",
          workplaceColor: "#FF5733",
          wage: 18588,
          workHours: 13.5,
        },
        {
          workplaceId: "workplace-2",
          workplaceName: "勤務先B",
          workplaceColor: "#3366FF",
          wage: 3333,
          workHours: 3.33,
        },
      ],
    });
  });

  it("シフト日付に対して適用開始日が最も新しいルールを選択する", () => {
    const rules = [
      createRule({
        id: "rule-old",
        startDate: date("2026-01-01"),
        endDate: date("2026-04-01"),
        baseHourlyWage: new Prisma.Decimal(1100),
        holidayType: "NONE",
      }),
      createRule({
        id: "rule-new",
        startDate: date("2026-04-01"),
        endDate: null,
        baseHourlyWage: new Prisma.Decimal(1200),
        holidayType: "NONE",
      }),
    ];
    const shifts: ShiftWithSummaryRelations[] = [
      createShift({
        id: "shift-march",
        date: date("2026-03-20"),
      }),
      createShift({
        id: "shift-april",
        date: date("2026-04-05"),
      }),
    ];

    const result = summarizeByPeriod(
      shifts,
      rules,
      date("2026-03-01"),
      date("2026-04-30"),
    );

    expect(result.totalWage).toBe(16100);
  });

  it("適用可能な給与ルールがないシフトを含む場合は例外を投げる", () => {
    const shifts: ShiftWithSummaryRelations[] = [createShift()];

    expect(() =>
      summarizeByPeriod(shifts, [], date("2026-03-01"), date("2026-03-31")),
    ).toThrow("該当する給与ルールが見つかりません");
  });
});
