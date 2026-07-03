import { render, screen, within } from "@testing-library/react";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { useMonthShifts } from "@/hooks/use-month-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { usePayrollSummaryAmountQuery } from "@/lib/query/queries/payroll";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

jest.mock("@/components/calendar/MonthCalendar", () => ({
  MonthCalendar: jest.fn(() => <div data-testid="month-calendar" />),
}));

jest.mock("@/components/calendar/ShiftListModal", () => ({
  ShiftListModal: jest.fn(() => null),
}));

jest.mock("@/hooks/use-google-token-expired-signout", () => ({
  useGoogleTokenExpiredSignOut: jest.fn(),
}));

jest.mock("@/hooks/use-month-shifts", () => ({
  useMonthShifts: jest.fn(),
  summarizeShifts: jest.fn(() => ({
    totalWorkedMinutes: 0,
    totalEstimatedPay: 0,
    shiftCount: 0,
  })),
}));

jest.mock("@/lib/query/query-client", () => ({
  getBrowserQueryClient: jest.fn(),
}));

jest.mock("@/lib/query/queries/payroll", () => ({
  usePayrollSummaryAmountQuery: jest.fn(),
}));

const mockedUseGoogleTokenExpiredSignOut =
  useGoogleTokenExpiredSignOut as jest.MockedFunction<
    typeof useGoogleTokenExpiredSignOut
  >;
const mockedUseMonthShifts = useMonthShifts as jest.MockedFunction<
  typeof useMonthShifts
>;
const mockedGetBrowserQueryClient =
  getBrowserQueryClient as jest.MockedFunction<typeof getBrowserQueryClient>;
const mockedUsePayrollSummaryAmountQuery =
  usePayrollSummaryAmountQuery as jest.MockedFunction<
    typeof usePayrollSummaryAmountQuery
  >;

describe("DashboardPageClient", () => {
  beforeEach(() => {
    mockedUseGoogleTokenExpiredSignOut.mockReset();
    mockedUseMonthShifts.mockReset();
    mockedGetBrowserQueryClient.mockReset();
    mockedUsePayrollSummaryAmountQuery.mockReset();

    mockedUseGoogleTokenExpiredSignOut.mockReturnValue({
      isSignOutScheduled: false,
      scheduleSignOut: jest.fn(),
    });
    mockedGetBrowserQueryClient.mockReturnValue(
      {} as ReturnType<typeof getBrowserQueryClient>,
    );
    mockedUseMonthShifts.mockReturnValue({
      shifts: [],
      displayMonth: new Date("2026-07-01T00:00:00.000Z"),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      isPlaceholderData: false,
      errorMessage: null,
      reload: jest.fn(),
    } as ReturnType<typeof useMonthShifts>);
    mockedUsePayrollSummaryAmountQuery.mockReturnValue({
      data: undefined,
      error: new Error("internal server error"),
      isError: true,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
    } as ReturnType<typeof usePayrollSummaryAmountQuery>);
  });

  it("initialNextPaymentAmount が null で初回取得が失敗した場合は翌月支給額カードにフォールバックのエラー文言を表示する", () => {
    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    expect(mockedUsePayrollSummaryAmountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-08",
      initialData: undefined,
    });

    const nextPaymentCard = screen
      .getByText("翌月支給額")
      .closest("[data-slot='card']");

    expect(nextPaymentCard).not.toBeNull();
    expect(
      within(nextPaymentCard as HTMLElement).getByText(
        "次回支給額の取得に失敗しました。 時間をおいてから再実行してください。",
      ),
    ).toBeInTheDocument();
    expect(
      within(nextPaymentCard as HTMLElement).queryByText(
        "internal server error",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(nextPaymentCard as HTMLElement).queryByText("読み込み中..."),
    ).not.toBeInTheDocument();
  });
});
