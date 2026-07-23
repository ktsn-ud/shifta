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

const emptyMonthlyDetails: PayrollDetailsMonthlyResult = {
  month: "2026-05",
  shiftCount: 0,
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

const emptyYearlyDetails: PayrollDetailsWorkplaceYearlyResult = {
  year: 2026,
  shiftCount: 0,
  workplaces: [],
};

describe("給与詳細の空状態", () => {
  beforeEach(() => {
    mockedUsePayrollDetailsMonthlyQuery.mockReturnValue({
      data: emptyMonthlyDetails,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsMonthlyQuery>);
    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockReturnValue({
      data: emptyYearlyDetails,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsWorkplaceYearlyQuery>);
  });

  it("月次・年次の再取得中は更新フロートと既存オーバーレイを表示する", () => {
    mockedUsePayrollDetailsMonthlyQuery.mockReturnValue({
      data: emptyMonthlyDetails,
      isLoading: false,
      isFetching: true,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsMonthlyQuery>);
    const { rerender } = render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={emptyMonthlyDetails}
      />,
    );
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();
    expect(screen.getByText("最新データを更新中...")).toBeInTheDocument();
    expect(
      screen.queryByText("給与詳細の最新データを確認中です。"),
    ).not.toBeInTheDocument();

    mockedUsePayrollDetailsWorkplaceYearlyQuery.mockReturnValue({
      data: emptyYearlyDetails,
      isLoading: false,
      isFetching: true,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof usePayrollDetailsWorkplaceYearlyQuery>);
    rerender(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={emptyYearlyDetails}
      />,
    );
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();
    expect(screen.getByText("最新データを更新中...")).toBeInTheDocument();
    expect(
      screen.queryByText("給与詳細の最新データを確認中です。"),
    ).not.toBeInTheDocument();
  });

  it("月別表示では空状態と対象月付きのシフト登録CTAだけを表示する", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={emptyMonthlyDetails}
      />,
    );

    expect(
      screen.getByText("2026年5月のシフトはありません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "この月のシフトを登録" }),
    ).toHaveAttribute("href", "/my/shifts/new?date=2026-05-01&month=2026-05");
    expect(screen.queryByText("総勤務時間")).not.toBeInTheDocument();
    expect(screen.queryByText("勤務先別内訳")).not.toBeInTheDocument();
  });

  it("勤務先年次表示では空状態と対象年付きのシフト登録CTAだけを表示する", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={emptyYearlyDetails}
      />,
    );

    expect(screen.getByText("2026年のシフトはありません")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "この年のシフトを登録" }),
    ).toHaveAttribute("href", "/my/shifts/new?date=2026-01-01&month=2026-01");
    expect(screen.queryByText("年間 基本勤務金額")).not.toBeInTheDocument();
  });
});
