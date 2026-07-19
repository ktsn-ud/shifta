import { render, screen } from "@testing-library/react";
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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

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

const zeroBreakdown = {
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
};

const displayValue = {
  estimatedAmount: 0,
  actualAmount: null,
  displayAmount: 0,
  differenceAmount: 0,
  isActualApplied: false,
};

const actualCoverage = {
  taxableAmount: 0,
  nonTaxableAmount: 0,
  totalAmount: 0,
  registeredWorkplaceCount: 0,
  totalWorkplaceCount: 1,
  isPartial: false,
};

const zeroValueMonthlyDetails: PayrollDetailsMonthlyResult = {
  month: "2026-05",
  shiftCount: 1,
  totals: zeroBreakdown,
  totalsDisplayValue: displayValue,
  actualCoverage,
  byWorkplace: [
    {
      workplaceId: "workplace-1",
      workplaceName: "勤務先A",
      workplaceColor: "#3366FF",
      periodStartDate: "2026-05-01",
      periodEndDate: "2026-05-31",
      displayValue,
      actualPayroll: null,
      ...zeroBreakdown,
    },
  ],
};

const zeroValueYearlyDetails: PayrollDetailsWorkplaceYearlyResult = {
  year: 2026,
  shiftCount: 1,
  workplaces: [
    {
      workplaceId: "workplace-1",
      shiftCount: 1,
      workplaceName: "勤務先A",
      workplaceColor: "#3366FF",
      yearlyTotals: zeroBreakdown,
      yearlyDisplayValue: displayValue,
      actualCoverage,
      months: [
        {
          month: 5,
          monthKey: "2026-05",
          periodStartDate: "2026-05-01",
          periodEndDate: "2026-05-31",
          displayValue,
          actualPayroll: null,
          ...zeroBreakdown,
        },
      ],
    },
  ],
};

describe("実績が0のシフトを含む給与詳細", () => {
  beforeEach(() => {
    mockedUsePayrollDetailsMonthlyQuery.mockReturnValue({
      data: zeroValueMonthlyDetails,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsMonthlyQuery>);
    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockReturnValue({
      data: zeroValueYearlyDetails,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsWorkplaceYearlyQuery>);
  });

  it("月別表示ではshiftCountがあれば0円・0時間でも詳細を表示する", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={zeroValueMonthlyDetails}
      />,
    );

    expect(screen.getByText("基本勤務")).toBeInTheDocument();
    expect(screen.getByText("勤務先別内訳")).toBeInTheDocument();
    expect(
      screen.queryByText("2026年5月のシフトはありません"),
    ).not.toBeInTheDocument();
  });

  it("勤務先年次表示ではshiftCountがあれば0円・0時間でも詳細を表示する", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={zeroValueYearlyDetails}
      />,
    );

    expect(screen.getByText("勤務先A")).toBeInTheDocument();
    expect(screen.getByText("年間 基本勤務金額")).toBeInTheDocument();
    expect(
      screen.queryByText("2026年のシフトはありません"),
    ).not.toBeInTheDocument();
  });
});
