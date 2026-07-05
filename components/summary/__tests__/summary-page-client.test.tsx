import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryPageClient } from "@/components/summary/summary-page-client";
import type { PayrollSummaryResult } from "@/lib/payroll/summary";
import { usePayrollSummaryQuery } from "@/lib/query/queries/payroll";

jest.mock("@/lib/query/queries/payroll", () => ({
  usePayrollSummaryQuery: jest.fn(),
}));

const mockedUsePayrollSummaryQuery =
  usePayrollSummaryQuery as jest.MockedFunction<typeof usePayrollSummaryQuery>;

function createSummary(year: number): PayrollSummaryResult {
  return {
    year,
    workplaces: [
      {
        workplaceId: "workplace-1",
        workplaceName: "勤務先A",
        workplaceColor: "#3366FF",
      },
      {
        workplaceId: "workplace-2",
        workplaceName: "勤務先B",
        workplaceColor: "#FF6633",
      },
    ],
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      monthKey: `${year}-${String(index + 1).padStart(2, "0")}`,
      incomeByWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: index === 0 ? 5000 : 0,
          nonTaxableAmount: index === 0 ? 500 : 0,
          totalAmount: index === 0 ? 5500 : 0,
        },
        {
          workplaceId: "workplace-2",
          taxableAmount: index === 0 ? 3000 : 0,
          nonTaxableAmount: 0,
          totalAmount: index === 0 ? 3000 : 0,
        },
      ],
      hoursByWorkplace: [
        {
          workplaceId: "workplace-1",
          totalWorkHours: index === 0 ? 5 : 0,
        },
        {
          workplaceId: "workplace-2",
          totalWorkHours: index === 0 ? 3 : 0,
        },
      ],
      totals: {
        taxableAmount: index === 0 ? 8000 : 0,
        nonTaxableAmount: index === 0 ? 500 : 0,
        totalAmount: index === 0 ? 8500 : 0,
        totalWorkHours: index === 0 ? 8 : 0,
      },
    })),
    yearlyTotals: {
      byWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: 5000,
          nonTaxableAmount: 500,
          totalAmount: 5500,
          totalWorkHours: 5,
        },
        {
          workplaceId: "workplace-2",
          taxableAmount: 3000,
          nonTaxableAmount: 0,
          totalAmount: 3000,
          totalWorkHours: 3,
        },
      ],
      grandTotals: {
        taxableAmount: 8000,
        nonTaxableAmount: 500,
        totalAmount: 8500,
        totalWorkHours: 8,
      },
    },
  };
}

function renderSummaryPageClient(initialSummary = createSummary(2026)) {
  return render(
    <SummaryPageClient
      currentUserId="user-1"
      initialSummary={initialSummary}
      initialYear={2026}
      currentYearValue="2026"
    />,
  );
}

describe("SummaryPageClient", () => {
  beforeEach(() => {
    mockedUsePayrollSummaryQuery.mockReset();

    mockedUsePayrollSummaryQuery.mockImplementation((input) => {
      const data = input.initialData ?? createSummary(input.year);

      return {
        data,
        isLoading: false,
        isFetching: false,
        isPlaceholderData: false,
        error: null,
      } as ReturnType<typeof usePayrollSummaryQuery>;
    });
  });

  it("初期年では initialData 付きの usePayrollSummaryQuery だけで表示する", () => {
    const initialSummary = createSummary(2026);

    renderSummaryPageClient(initialSummary);

    expect(mockedUsePayrollSummaryQuery).toHaveBeenCalledTimes(1);
    expect(mockedUsePayrollSummaryQuery).toHaveBeenCalledWith({
      userId: "user-1",
      year: 2026,
      enabled: true,
      initialData: initialSummary,
    });
    expect(screen.getByText("所得テーブル")).toBeInTheDocument();
    expect(screen.getByText("勤務時間テーブル")).toBeInTheDocument();
  });

  it("年を変更した後は initialData なしで再取得する", async () => {
    const user = userEvent.setup();
    const { container } = renderSummaryPageClient();

    const yearInput = container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement | null;

    expect(yearInput).not.toBeNull();
    fireEvent.change(yearInput!, {
      target: { value: "2027" },
    });

    await user.click(screen.getByRole("button", { name: "適用" }));

    await waitFor(() => {
      expect(mockedUsePayrollSummaryQuery).toHaveBeenLastCalledWith({
        userId: "user-1",
        year: 2027,
        enabled: true,
        initialData: undefined,
      });
    });
  });

  it("勤務先グループ列と年合計行を2テーブルに表示する", () => {
    renderSummaryPageClient();

    expect(screen.getAllByText("勤務先A")).toHaveLength(2);
    expect(screen.getAllByText("勤務先B")).toHaveLength(2);
    expect(screen.getByText("全勤務先合計")).toBeInTheDocument();
    expect(screen.getByText("全勤務先合計時間")).toBeInTheDocument();
    expect(screen.getAllByText("年合計")).toHaveLength(2);
    expect(screen.getAllByText("課税所得").length).toBeGreaterThan(0);
    expect(screen.getAllByText("総勤務時間").length).toBeGreaterThan(0);
  });

  it("勤務先がない場合は 0件表示を出す", () => {
    const emptySummary: PayrollSummaryResult = {
      year: 2026,
      workplaces: [],
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        monthKey: `2026-${String(index + 1).padStart(2, "0")}`,
        incomeByWorkplace: [],
        hoursByWorkplace: [],
        totals: {
          taxableAmount: 0,
          nonTaxableAmount: 0,
          totalAmount: 0,
          totalWorkHours: 0,
        },
      })),
      yearlyTotals: {
        byWorkplace: [],
        grandTotals: {
          taxableAmount: 0,
          nonTaxableAmount: 0,
          totalAmount: 0,
          totalWorkHours: 0,
        },
      },
    };

    renderSummaryPageClient(emptySummary);

    expect(
      screen.getByText("対象年の集計データはありません。"),
    ).toBeInTheDocument();
  });

  it("勤務先があっても対象年データが全て0なら 0件表示を出す", () => {
    const zeroSummary: PayrollSummaryResult = {
      ...createSummary(2026),
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        monthKey: `2026-${String(index + 1).padStart(2, "0")}`,
        incomeByWorkplace: [
          {
            workplaceId: "workplace-1",
            taxableAmount: 0,
            nonTaxableAmount: 0,
            totalAmount: 0,
          },
          {
            workplaceId: "workplace-2",
            taxableAmount: 0,
            nonTaxableAmount: 0,
            totalAmount: 0,
          },
        ],
        hoursByWorkplace: [
          {
            workplaceId: "workplace-1",
            totalWorkHours: 0,
          },
          {
            workplaceId: "workplace-2",
            totalWorkHours: 0,
          },
        ],
        totals: {
          taxableAmount: 0,
          nonTaxableAmount: 0,
          totalAmount: 0,
          totalWorkHours: 0,
        },
      })),
      yearlyTotals: {
        byWorkplace: [
          {
            workplaceId: "workplace-1",
            taxableAmount: 0,
            nonTaxableAmount: 0,
            totalAmount: 0,
            totalWorkHours: 0,
          },
          {
            workplaceId: "workplace-2",
            taxableAmount: 0,
            nonTaxableAmount: 0,
            totalAmount: 0,
            totalWorkHours: 0,
          },
        ],
        grandTotals: {
          taxableAmount: 0,
          nonTaxableAmount: 0,
          totalAmount: 0,
          totalWorkHours: 0,
        },
      },
    };

    renderSummaryPageClient(zeroSummary);

    expect(
      screen.getByText("対象年の集計データはありません。"),
    ).toBeInTheDocument();
  });
});
