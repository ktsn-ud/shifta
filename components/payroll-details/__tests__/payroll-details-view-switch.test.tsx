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

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
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

const monthlyDetails: PayrollDetailsMonthlyResult = {
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

const yearlyDetails: PayrollDetailsWorkplaceYearlyResult = {
  year: 2026,
  shiftCount: 0,
  workplaces: [],
};

describe("給与詳細の表示切替", () => {
  beforeEach(() => {
    replaceMock.mockReset();
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

  it("月を適用すると月別表示のURLを更新する", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={monthlyDetails}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("2026-05"), {
      target: { value: "2027-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/my/payroll-details/monthly?month=2027-01",
    );
  });

  it("月別表示で今月に戻ると現在月のURLを更新する", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={monthlyDetails}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今月に戻る" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/my/payroll-details/monthly?month=2026-07",
    );
  });

  it("月別表示で不正な月を適用してもURLを更新しない", () => {
    render(
      <PayrollDetailsMonthlyPageClient
        currentUserId="user-1"
        initialMonth="2026-05"
        currentMonthValue="2026-07"
        initialDetails={monthlyDetails}
      />,
    );

    const monthInput = screen.getByDisplayValue("2026-05");
    fireEvent.change(monthInput, { target: { value: "" } });
    fireEvent.keyDown(monthInput, { key: "Enter" });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("年を適用すると勤務先別表示のURLを更新する", () => {
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
      target: { value: "2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/my/payroll-details/workplace-yearly?year=2027",
    );
  });

  it("勤務先別表示で今年に戻ると現在年のURLを更新する", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2025}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={yearlyDetails}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今年に戻る" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/my/payroll-details/workplace-yearly?year=2026",
    );
  });

  it("勤務先別表示で不正な年を適用してもURLを更新しない", () => {
    render(
      <PayrollDetailsWorkplaceYearlyPageClient
        currentUserId="user-1"
        initialYear={2026}
        currentMonthValue="2026-07"
        currentYearValue="2026"
        initialDetails={yearlyDetails}
      />,
    );

    const yearInput = screen.getByRole("spinbutton");
    fireEvent.change(yearInput, { target: { value: "1999" } });
    fireEvent.keyDown(yearInput, { key: "Enter" });

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
