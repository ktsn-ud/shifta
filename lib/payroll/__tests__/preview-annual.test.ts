import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

jest.mock("@/lib/payroll/summary", () => ({
  getPayrollSummaryForUser: jest.fn(),
}));

import { getPayrollAnnualPreviewForUser } from "@/lib/payroll/preview-annual";

const getPayrollSummaryForUserMock = jest.mocked(getPayrollSummaryForUser);

describe("getPayrollAnnualPreviewForUser", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("deduplicates and orders years while returning all annual amount breakdowns", async () => {
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
      },
    });
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2026);
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2027);
  });
});
