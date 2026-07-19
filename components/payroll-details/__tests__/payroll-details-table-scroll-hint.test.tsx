import { render, screen } from "@testing-library/react";
import { PayrollDetailsWorkplaceYearlyPageClient } from "@/components/payroll-details/payroll-details-workplace-yearly-page-client";
import { usePayrollDetailsWorkplaceYearlyQuery } from "@/lib/query/queries/payroll";
import type { PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";

jest.mock("@/lib/query/queries/payroll", () => ({
  usePayrollDetailsWorkplaceYearlyQuery: jest.fn(),
}));

const mockedUsePayrollDetailsWorkplaceYearlyQuery =
  usePayrollDetailsWorkplaceYearlyQuery as jest.MockedFunction<
    typeof usePayrollDetailsWorkplaceYearlyQuery
  >;

const yearlyDetailsWithWorkplace: PayrollDetailsWorkplaceYearlyResult = {
  year: 2026,
  workplaces: [
    {
      workplaceId: "workplace-1",
      workplaceName: "勤務先A",
      workplaceColor: "#3366FF",
      yearlyTotals: {
        totalWorkHours: 8,
        baseHours: 8,
        holidayHours: 0,
        nightHours: 0,
        overtimeHours: 0,
        totalWage: 8000,
        baseWage: 8000,
        holidayWage: 0,
        nightWage: 0,
        workDuration: "8:00",
        baseDuration: "8:00",
        holidayDuration: "0:00",
        nightDuration: "0:00",
        overtimeDuration: "0:00",
        effectiveBaseHourlyWage: 1000,
        effectiveHolidayAllowanceHourly: null,
        effectiveNightHourlyWage: null,
        effectiveNightPremiumRate: null,
      },
      yearlyDisplayValue: {
        estimatedAmount: 8000,
        actualAmount: null,
        displayAmount: 8000,
        differenceAmount: 0,
        isActualApplied: false,
      },
      actualCoverage: {
        taxableAmount: 0,
        nonTaxableAmount: 0,
        totalAmount: 0,
        registeredWorkplaceCount: 0,
        totalWorkplaceCount: 1,
        isPartial: false,
      },
      months: [
        {
          month: 1,
          monthKey: "2026-01",
          periodStartDate: "2026-01-01",
          periodEndDate: "2026-01-31",
          displayValue: {
            estimatedAmount: 8000,
            actualAmount: null,
            displayAmount: 8000,
            differenceAmount: 0,
            isActualApplied: false,
          },
          actualPayroll: null,
          totalWorkHours: 8,
          baseHours: 8,
          holidayHours: 0,
          nightHours: 0,
          overtimeHours: 0,
          totalWage: 8000,
          baseWage: 8000,
          holidayWage: 0,
          nightWage: 0,
          workDuration: "8:00",
          baseDuration: "8:00",
          holidayDuration: "0:00",
          nightDuration: "0:00",
          overtimeDuration: "0:00",
          effectiveBaseHourlyWage: 1000,
          effectiveHolidayAllowanceHourly: null,
          effectiveNightHourlyWage: null,
          effectiveNightPremiumRate: null,
        },
      ],
    },
  ],
};

describe("勤務先別年次詳細の横スクロールヒント", () => {
  beforeEach(() => {
    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockReturnValue({
      data: yearlyDetailsWithWorkplace,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsWorkplaceYearlyQuery>);
  });

  it("勤務先別年次詳細テーブルに横スクロールのヒントを表示する", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={yearlyDetailsWithWorkplace}
      />,
    );

    expect(
      screen.getByText("表は横にスクロールして確認できます。"),
    ).toBeInTheDocument();
  });
});
