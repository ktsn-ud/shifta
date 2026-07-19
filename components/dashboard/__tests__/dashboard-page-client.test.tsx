import { fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { useMonthShifts } from "@/hooks/use-month-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { usePayrollSummaryAmountQuery } from "@/lib/query/queries/payroll";

const pushMock = jest.fn();
const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: pushMock,
    replace: replaceMock,
  })),
}));

jest.mock("@/components/calendar/MonthCalendar", () => ({
  MonthCalendar: jest.fn(
    ({
      onDateClick,
      onNavigateNext,
    }: {
      onDateClick: (date: Date) => void;
      onNavigateNext: () => void;
    }) => (
      <div>
        <button type="button" onClick={onNavigateNext}>
          次月へ移動
        </button>
        <button
          type="button"
          onClick={() => onDateClick(new Date(2026, 6, 10))}
        >
          シフトありの日を開く
        </button>
        <button
          type="button"
          onClick={() => onDateClick(new Date(2026, 6, 20))}
        >
          空の日を開く
        </button>
      </div>
    ),
  ),
}));

jest.mock("@/components/calendar/ShiftListModal", () => ({
  ShiftListModal: jest.fn(
    ({
      onCreateShift,
      open,
      targetDate,
    }: {
      onCreateShift: (date: Date) => void;
      open: boolean;
      targetDate: Date;
    }) =>
      open ? (
        <div role="dialog">
          <p>日別シフトモーダル</p>
          <button type="button" onClick={() => onCreateShift(targetDate)}>
            この日に追加
          </button>
        </div>
      ) : null,
  ),
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
    pushMock.mockReset();
    replaceMock.mockReset();
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

  it("初期月の翌月支給額 query には SSR の initialData を引き継ぐ", () => {
    const initialNextPaymentAmount = {
      month: "2026-08",
      totalWage: 123456,
    };

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialNextPaymentAmount={initialNextPaymentAmount}
        todayDate="2026-07-15"
      />,
    );

    expect(mockedUsePayrollSummaryAmountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-08",
      initialData: initialNextPaymentAmount,
    });
  });

  it("月移動は URL を置換し、一括登録には表示中の月を引き継ぐ", () => {
    mockedUseMonthShifts.mockImplementation(
      (month) =>
        ({
          shifts: [],
          displayMonth: month,
          isLoading: false,
          isInitialLoading: false,
          isRefreshing: false,
          isPlaceholderData: false,
          errorMessage: null,
          reload: jest.fn(),
        }) as ReturnType<typeof useMonthShifts>,
    );

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

    fireEvent.click(screen.getByRole("button", { name: "次月へ移動" }));
    expect(replaceMock).toHaveBeenCalledWith("/my?month=2026-08");

    fireEvent.click(screen.getByRole("button", { name: "一括登録" }));
    expect(pushMock).toHaveBeenCalledWith("/my/shifts/bulk?month=2026-08");
  });
  it("シフトの有無にかかわらず日付クリックで日別モーダルを開く", () => {
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

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "空の日を開く" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("空の日のモーダルから、その日を初期日としてシフトを追加できる", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "空の日を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "この日に追加" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/my/shifts/new?date=2026-07-20&month=2026-07",
    );
  });

  it("ヘッダーの新規登録は選択日を初期日にし、別月では表示月の日付を使う", () => {
    mockedUseMonthShifts.mockImplementation(
      (month) =>
        ({
          shifts: [],
          displayMonth: month,
          isLoading: false,
          isInitialLoading: false,
          isRefreshing: false,
          isPlaceholderData: false,
          errorMessage: null,
          reload: jest.fn(),
        }) as ReturnType<typeof useMonthShifts>,
    );

    const { unmount } = render(
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

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "新規シフト登録" }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/my/shifts/new?date=2026-07-10&month=2026-07",
    );

    unmount();

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-08-01"
        initialMonthEndDate="2026-08-31"
        initialUnconfirmedShiftCount={0}
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新規シフト登録" }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/my/shifts/new?date=2026-08-15&month=2026-08",
    );
  });
});
