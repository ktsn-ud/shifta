import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryPageClient } from "@/components/summary/summary-page-client";
import type {
  PayrollSummaryCoreResult,
  PayrollSummaryYearContextResult,
} from "@/lib/payroll/summary";
import {
  usePayrollSummaryQuery,
  usePayrollSummaryYearContextQuery,
} from "@/lib/query/queries/payroll";

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function MockDynamicComponent() {
      return <div data-testid="workplace-wage-chart" />;
    },
}));

jest.mock("@/lib/query/queries/payroll", () => ({
  usePayrollSummaryQuery: jest.fn(),
  usePayrollSummaryYearContextQuery: jest.fn(),
}));

const mockedUsePayrollSummaryQuery =
  usePayrollSummaryQuery as jest.MockedFunction<typeof usePayrollSummaryQuery>;
const mockedUsePayrollSummaryYearContextQuery =
  usePayrollSummaryYearContextQuery as jest.MockedFunction<
    typeof usePayrollSummaryYearContextQuery
  >;

function createActualCoverage() {
  return {
    totalWorkplaceCount: 1,
    registeredWorkplaceCount: 1,
    isPartial: false,
    taxableAmount: 120000,
    nonTaxableAmount: 0,
    totalAmount: 120000,
  };
}

function createSummary(month: string): PayrollSummaryCoreResult {
  return {
    month,
    totalWage: 120000,
    estimatedTotalWage: 118000,
    displayValue: {
      estimatedAmount: 118000,
      actualAmount: {
        taxableAmount: 120000,
        nonTaxableAmount: 0,
        totalAmount: 120000,
      },
      displayAmount: 120000,
      differenceAmount: 2000,
      isActualApplied: true,
    },
    actualCoverage: createActualCoverage(),
    totalWorkHours: 80,
    totalNightHours: 4,
    totalOvertimeHours: 2,
    byWorkplace: [
      {
        workplaceId: "workplace-1",
        workplaceName: "勤務先A",
        workplaceColor: "#3366FF",
        periodStartDate: `${month}-01`,
        periodEndDate: `${month}-31`,
        wage: 120000,
        workHours: 80,
        displayValue: {
          estimatedAmount: 118000,
          actualAmount: {
            taxableAmount: 120000,
            nonTaxableAmount: 0,
            totalAmount: 120000,
          },
          displayAmount: 120000,
          differenceAmount: 2000,
          isActualApplied: true,
        },
        actualPayroll: {
          taxableAmount: 120000,
          nonTaxableAmount: 0,
          totalAmount: 120000,
          note: null,
        },
      },
    ],
    confirmedShiftWage: 120000,
  };
}

function createSummaryYearContext(
  month: string,
): PayrollSummaryYearContextResult {
  return {
    month,
    currentMonthCumulative: 360000,
    yearlyTotal: 720000,
    currentMonthActualCoverage: createActualCoverage(),
    yearlyActualCoverage: createActualCoverage(),
    estimatedCurrentMonthCumulative: 354000,
    estimatedYearlyTotal: 708000,
  };
}

function renderSummaryPageClient() {
  const initialSummary = createSummary("2026-03");
  const initialSummaryYearContext = createSummaryYearContext("2026-03");

  return render(
    <SummaryPageClient
      currentUserId="user-1"
      initialSummary={initialSummary}
      initialSummaryYearContext={initialSummaryYearContext}
      initialMonth="2026-03"
      currentMonthValue="2026-03"
    />,
  );
}

describe("SummaryPageClient", () => {
  beforeEach(() => {
    mockedUsePayrollSummaryQuery.mockReset();
    mockedUsePayrollSummaryYearContextQuery.mockReset();

    mockedUsePayrollSummaryQuery.mockImplementation((input) => {
      const data = input.initialData ?? createSummary(input.month);

      return {
        data,
        isLoading: false,
        isFetching: false,
        isPlaceholderData: false,
        error: null,
      } as ReturnType<typeof usePayrollSummaryQuery>;
    });

    mockedUsePayrollSummaryYearContextQuery.mockImplementation((input) => {
      const data = input.initialData ?? createSummaryYearContext(input.month);

      return {
        data,
        isLoading: false,
        isFetching: false,
        isPlaceholderData: false,
        error: null,
      } as ReturnType<typeof usePayrollSummaryYearContextQuery>;
    });
  });

  it("初期月では year context query に initialData を渡す", () => {
    const initialSummary = createSummary("2026-03");
    const initialSummaryYearContext = createSummaryYearContext("2026-03");

    render(
      <SummaryPageClient
        currentUserId="user-1"
        initialSummary={initialSummary}
        initialSummaryYearContext={initialSummaryYearContext}
        initialMonth="2026-03"
        currentMonthValue="2026-03"
      />,
    );

    expect(mockedUsePayrollSummaryQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-03",
      enabled: true,
      initialData: initialSummary,
    });
    expect(mockedUsePayrollSummaryYearContextQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-03",
      enabled: true,
      initialData: initialSummaryYearContext,
    });
  });

  it("非初期月へ変更した後は initialData なしで通常 query に切り替わる", async () => {
    const user = userEvent.setup();
    const { container } = renderSummaryPageClient();

    const monthInput = container.querySelector(
      'input[type="month"]',
    ) as HTMLInputElement | null;

    expect(monthInput).not.toBeNull();
    fireEvent.change(monthInput!, {
      target: { value: "2026-04" },
    });

    await user.click(screen.getByRole("button", { name: "適用" }));

    await waitFor(() => {
      expect(mockedUsePayrollSummaryQuery).toHaveBeenCalledWith({
        userId: "user-1",
        month: "2026-04",
        enabled: true,
        initialData: undefined,
      });
      expect(mockedUsePayrollSummaryYearContextQuery).toHaveBeenCalledWith({
        userId: "user-1",
        month: "2026-04",
        enabled: true,
        initialData: undefined,
      });
    });
  });
});
