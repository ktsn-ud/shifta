import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPayrollSnapshot } from "@/lib/payroll/snapshot";

jest.mock("react", () => ({
  cache: <T>(fn: T) => fn,
}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
    payrollRule: {
      findMany: jest.fn(),
    },
  },
}));

const cacheLifeMock = jest.mocked(cacheLife);
const cacheTagMock = jest.mocked(cacheTag);
const workplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const shiftFindManyMock = jest.mocked(prisma.shift.findMany);
const payrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);

describe("payroll snapshot cache tags", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    workplaceFindManyMock.mockResolvedValue([]);
    shiftFindManyMock.mockResolvedValue([]);
    payrollRuleFindManyMock.mockResolvedValue([]);
  });

  it("tags a requested month with both its broad user snapshot and its specific month", async () => {
    await loadPayrollSnapshot({
      userId: "user-1",
      monthDates: [new Date("2026-04-01T00:00:00.000Z")],
    });

    expect(cacheLifeMock).toHaveBeenCalledWith("minutes");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      "user:user-1:payroll-snapshot:2026-04",
    );
  });

  it("tags every distinct requested month for the annual twelve-month snapshot", async () => {
    await loadPayrollSnapshot({
      userId: "user-1",
      monthDates: Array.from(
        { length: 12 },
        (_, month) => new Date(Date.UTC(2026, month, 1)),
      ),
    });

    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      ...Array.from(
        { length: 12 },
        (_, month) =>
          `user:user-1:payroll-snapshot:2026-${String(month + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("事務時給をbaseHourlyWageと同じDecimal文字列としてsnapshotに復元する", async () => {
    workplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        name: "青葉塾",
        color: "#3366FF",
        type: "CRAM_SCHOOL",
        closingDayType: "END_OF_MONTH",
        closingDay: null,
        payday: 25,
      },
    ] as never);
    payrollRuleFindManyMock.mockResolvedValue([
      {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        baseHourlyWage: new Prisma.Decimal("1200.00"),
        administrativeHourlyWage: 900,
        holidayAllowanceHourly: new Prisma.Decimal("0"),
        nightPremiumRate: new Prisma.Decimal("0.25"),
        overtimePremiumRate: new Prisma.Decimal("0.25"),
        dailyOvertimeThreshold: new Prisma.Decimal("8"),
        holidayType: "NONE",
      },
    ] as never);

    const snapshot = await loadPayrollSnapshot({
      userId: "user-1",
      monthDates: [new Date("2026-04-01T00:00:00.000Z")],
    });

    expect(
      snapshot.rulesByWorkplace.get("workplace-1")?.[0]
        ?.administrativeHourlyWage,
    ).toBe(900);
  });
});
