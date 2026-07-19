import { fireEvent, render, screen } from "@testing-library/react";
import { PayrollDetailsMonthlyPageClient } from "@/components/payroll-details/payroll-details-monthly-page-client";
import { PayrollDetailsWorkplaceYearlyPageClient } from "@/components/payroll-details/payroll-details-workplace-yearly-page-client";
import {
  usePayrollDetailsMonthlyQuery,
  usePayrollDetailsWorkplaceYearlyQuery,
} from "@/lib/query/queries/payroll";
import type {
  PayrollDetailsMonthlyResult,
  PayrollDetailsWorkplaceYearlyResult,
} from "@/lib/payroll/details";

jest.mock("@/lib/query/queries/payroll", () => ({
  usePayrollDetailsMonthlyQuery: jest.fn(),
  usePayrollDetailsWorkplaceYearlyQuery: jest.fn(),
}));

const mockedUsePayrollDetailsMonthlyQuery =
  usePayrollDetailsMonthlyQuery as jest.MockedFunction<
    typeof usePayrollDetailsMonthlyQuery
  >;
const mockedUsePayrollDetailsWorkplaceYearlyQuery =
  usePayrollDetailsWorkplaceYearlyQuery as jest.MockedFunction<
    typeof usePayrollDetailsWorkplaceYearlyQuery
  >;

const monthlyDetails: PayrollDetailsMonthlyResult = {
  month: "2026-05",
  totals: {
    totalWorkHours: 0,
    baseHours: 0,
    holidayHours: 0,
    nightHours: 0,
    overtimeHours: 0,
    totalWage: 0,
    baseWage: 0,
    holidayWage: 0,
    nightWage: 0,
    workDuration: "0:00",
    baseDuration: "0:00",
    holidayDuration: "0:00",
    nightDuration: "0:00",
    overtimeDuration: "0:00",
    effectiveBaseHourlyWage: null,
    effectiveHolidayAllowanceHourly: null,
    effectiveNightHourlyWage: null,
    effectiveNightPremiumRate: null,
  },
  totalsDisplayValue: {
    estimatedAmount: 0,
    actualAmount: null,
    displayAmount: 0,
    differenceAmount: 0,
    isActualApplied: false,
  },
  actualCoverage: {
    totalWorkplaceCount: 0,
    registeredWorkplaceCount: 0,
    taxableAmount: 0,
    nonTaxableAmount: 0,
    totalAmount: 0,
    isPartial: false,
  },
  byWorkplace: [],
};

const yearlyDetails: PayrollDetailsWorkplaceYearlyResult = {
  year: 2026,
  workplaces: [],
};

describe("給与詳細の表示切替", () => {
  beforeEach(() => {
    mockedUsePayrollDetailsMonthlyQuery.mockReset();
    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockReset();

    mockedUsePayrollDetailsMonthlyQuery.mockReturnValue({
      data: monthlyDetails,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsMonthlyQuery>);
    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockImplementation(
      (input) =>
        ({
          data: { ...yearlyDetails, year: input.year },
          isLoading: false,
          isFetching: false,
          isPlaceholderData: false,
          error: null,
        }) as ReturnType<typeof usePayrollDetailsWorkplaceYearlyQuery>,
    );
  });

  it("選択中の月から勤務先別表示へ年を引き継ぐ", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={monthlyDetails}
      />,
    );

    expect(
      screen.getByRole("link", { name: "勤務先別表示へ切り替え" }),
    ).toHaveAttribute("href", "/my/payroll-details/workplace-yearly?year=2026");
  });

  it("今年の勤務先別表示からは現在月を月別表示へ引き継ぐ", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={yearlyDetails}
      />,
    );

    expect(
      screen.getByRole("link", { name: "月別表示へ切り替え" }),
    ).toHaveAttribute("href", "/my/payroll-details/monthly?month=2026-07");
  });

  it("過去年の勤務先別表示からは1月を月別表示へ引き継ぐ", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={yearlyDetails}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2025" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(
      screen.getByRole("link", { name: "月別表示へ切り替え" }),
    ).toHaveAttribute("href", "/my/payroll-details/monthly?month=2025-01");
  });
});
