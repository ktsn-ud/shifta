import { getPayrollSummaryForUser } from "@/lib/payroll/summary";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/payroll/summary", () => ({
  getPayrollSummaryForUser: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    actualPayroll: {
      findMany: jest.fn(),
    },
  },
}));

import { getPayrollAnnualPreviewForUser } from "@/lib/payroll/preview-annual";

const getPayrollSummaryForUserMock = jest.mocked(getPayrollSummaryForUser);
const prismaActualPayrollFindManyMock = jest.mocked(
  prisma.actualPayroll.findMany,
);

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("getPayrollAnnualPreviewForUser", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("年を正規化し、所有ユーザーの実給与キーと年次内訳を返す", async () => {
    getPayrollSummaryForUserMock.mockImplementation(async (_userId, year) => ({
      year,
      yearlyTotals: {
        grandTotals: {
          taxableAmount: year === 2026 ? 120000 : 240000,
          nonTaxableAmount: year === 2026 ? 12000 : 24000,
          totalAmount: year === 2026 ? 132000 : 264000,
          totalWorkHours: 0,
        },
        byWorkplace: [],
      },
      workplaces: [],
      months: [],
    }));
    prismaActualPayrollFindManyMock.mockResolvedValue([
      {
        workplaceId: "workplace-1",
        paymentMonth: date("2026-12-01"),
      },
      {
        workplaceId: "workplace-2",
        paymentMonth: date("2027-01-01"),
      },
    ] as never);

    await expect(
      getPayrollAnnualPreviewForUser("user-1", [2027, 2026, 2027]),
    ).resolves.toEqual({
      data: {
        years: [
          {
            year: 2026,
            taxableAmount: 120000,
            nonTaxableAmount: 12000,
            totalAmount: 132000,
          },
          {
            year: 2027,
            taxableAmount: 240000,
            nonTaxableAmount: 24000,
            totalAmount: 264000,
          },
        ],
        actualPayrollKeys: [
          {
            workplaceId: "workplace-1",
            paymentMonth: "2026-12",
          },
          {
            workplaceId: "workplace-2",
            paymentMonth: "2027-01",
          },
        ],
      },
    });
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2026);
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2027);
    expect(prismaActualPayrollFindManyMock).toHaveBeenCalledWith({
      where: {
        workplace: { userId: "user-1" },
        paymentMonth: {
          gte: date("2026-01-01"),
          lt: date("2028-01-01"),
        },
      },
      select: { workplaceId: true, paymentMonth: true },
    });
  });
});
