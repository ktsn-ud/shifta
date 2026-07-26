import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getCachedPayrollRule,
  getCachedPayrollRulesForWorkplace,
  getCachedTimetableSetsForWorkplace,
  getCachedWorkplaceDetail,
  getCachedWorkplaces,
} from "@/lib/cache/workplace-read-cache";

jest.mock("server-only", () => ({}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    payrollRule: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    timetableSet: {
      findMany: jest.fn(),
    },
  },
}));

const cacheLifeMock = jest.mocked(cacheLife);
const cacheTagMock = jest.mocked(cacheTag);
const workplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const workplaceFindFirstMock = jest.mocked(prisma.workplace.findFirst);
const payrollRuleFindFirstMock = jest.mocked(prisma.payrollRule.findFirst);
const payrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const timetableSetFindManyMock = jest.mocked(prisma.timetableSet.findMany);

describe("workplace read cache", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("勤務先一覧を user ごとに最大寿命キャッシュし、DTO だけを返す", async () => {
    workplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        _count: { shifts: 2, payrollRules: 1, timetableSets: 0 },
        createdAt: new Date("2026-07-25T00:00:00.000Z"),
      },
    ] as never);

    await expect(getCachedWorkplaces("user-1")).resolves.toEqual([
      {
        id: "workplace-1",
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        _count: { shifts: 2, payrollRules: 1, timetableSets: 0 },
      },
    ]);

    expect(cacheLifeMock).toHaveBeenCalledWith("max");
    expect(cacheTagMock).toHaveBeenCalledWith("user:user-1:workplaces");
    expect(workplaceFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });

  it("勤務先詳細を user と workplace の両方で境界付ける", async () => {
    workplaceFindFirstMock.mockResolvedValue(null);

    await expect(
      getCachedWorkplaceDetail("user-1", "workplace-owned-by-user-2"),
    ).resolves.toBeNull();

    expect(cacheLifeMock).toHaveBeenCalledWith("max");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:workplaces",
      "workplace:workplace-owned-by-user-2:detail",
    );
    expect(workplaceFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "workplace-owned-by-user-2",
          userId: "user-1",
        },
      }),
    );
  });

  it("給与ルールの Date と Decimal をシリアライズ可能な DTO にし、所有者を query に含める", async () => {
    payrollRuleFindManyMock.mockResolvedValue([
      {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: null,
        baseHourlyWage: { toString: () => "1200.50" },
        holidayAllowanceHourly: { toString: () => "50" },
        nightPremiumRate: { toString: () => "0.25" },
        overtimePremiumRate: { toString: () => "0.35" },
        dailyOvertimeThreshold: { toString: () => "8" },
        holidayType: "WEEKEND",
      },
    ] as never);

    await expect(
      getCachedPayrollRulesForWorkplace("user-1", "workplace-1"),
    ).resolves.toEqual([
      {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: null,
        baseHourlyWage: "1200.50",
        holidayAllowanceHourly: "50",
        nightPremiumRate: "0.25",
        overtimePremiumRate: "0.35",
        dailyOvertimeThreshold: "8",
        holidayType: "WEEKEND",
      },
    ]);

    expect(cacheLifeMock).toHaveBeenCalledWith("max");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:workplaces",
      "workplace:workplace-1:detail",
      "workplace:workplace-1:payroll-rules",
    );
    expect(payrollRuleFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workplaceId: "workplace-1",
          workplace: { userId: "user-1" },
        },
      }),
    );
  });

  it("給与ルール詳細を最大寿命キャッシュの DTO として返す", async () => {
    payrollRuleFindFirstMock.mockResolvedValue({
      id: "rule-1",
      workplaceId: "workplace-1",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T00:00:00.000Z"),
      baseHourlyWage: { toString: () => "1200.50" },
      holidayAllowanceHourly: { toString: () => "50" },
      nightPremiumRate: { toString: () => "0.25" },
      overtimePremiumRate: { toString: () => "0.35" },
      dailyOvertimeThreshold: { toString: () => "8" },
      holidayType: "WEEKEND",
    } as never);

    await expect(
      getCachedPayrollRule("user-1", "workplace-1", "rule-1"),
    ).resolves.toEqual({
      id: "rule-1",
      workplaceId: "workplace-1",
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-31T00:00:00.000Z",
      baseHourlyWage: "1200.50",
      holidayAllowanceHourly: "50",
      nightPremiumRate: "0.25",
      overtimePremiumRate: "0.35",
      dailyOvertimeThreshold: "8",
      holidayType: "WEEKEND",
    });

    expect(cacheLifeMock).toHaveBeenCalledWith("max");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:workplaces",
      "workplace:workplace-1:detail",
      "workplace:workplace-1:payroll-rules",
    );
    expect(payrollRuleFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "rule-1",
        workplaceId: "workplace-1",
        workplace: { userId: "user-1" },
      },
    });
  });

  it("給与ルール詳細は所有外または存在しない ID を null として境界付ける", async () => {
    payrollRuleFindFirstMock.mockResolvedValue(null);

    await expect(
      getCachedPayrollRule("user-1", "workplace-1", "rule-owned-by-user-2"),
    ).resolves.toBeNull();

    expect(payrollRuleFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "rule-owned-by-user-2",
        workplaceId: "workplace-1",
        workplace: { userId: "user-1" },
      },
    });
  });

  it("時間割の日時と時刻ラベルを DTO 化し、時間割タグを付ける", async () => {
    timetableSetFindManyMock.mockResolvedValue([
      {
        id: "set-1",
        workplaceId: "workplace-1",
        name: "平日",
        sortOrder: 0,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        updatedAt: new Date("2026-07-21T00:00:00.000Z"),
        timetables: [
          {
            id: "timetable-1",
            timetableSetId: "set-1",
            period: 1,
            startTime: new Date("1970-01-01T09:30:00.000Z"),
            endTime: new Date("1970-01-01T10:45:00.000Z"),
          },
        ],
      },
    ] as never);

    await expect(
      getCachedTimetableSetsForWorkplace("user-1", "workplace-1"),
    ).resolves.toEqual([
      {
        id: "set-1",
        workplaceId: "workplace-1",
        name: "平日",
        sortOrder: 0,
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        timetables: [
          {
            id: "timetable-1",
            timetableSetId: "set-1",
            period: 1,
            startTime: "1970-01-01T09:30:00.000Z",
            endTime: "1970-01-01T10:45:00.000Z",
            startTimeLabel: "09:30",
            endTimeLabel: "10:45",
          },
        ],
      },
    ]);

    expect(cacheLifeMock).toHaveBeenCalledWith("max");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:workplaces",
      "workplace:workplace-1:detail",
      "workplace:workplace-1:timetables",
    );
    expect(timetableSetFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workplaceId: "workplace-1",
          workplace: { userId: "user-1" },
        },
      }),
    );
  });
});
