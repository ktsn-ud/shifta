import type { MouseEvent } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { type MonthShift, useMonthShifts } from "@/hooks/use-month-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { usePayrollSummaryAmountQuery } from "@/lib/query/queries/payroll";
import { useUnconfirmedShiftCountQuery } from "@/lib/query/queries/shift-confirmation";
import { removeShiftsFromMonthCachesOptimistically } from "@/lib/query/optimistic-shifts";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const cancelQueriesMock = jest.fn();
const invalidateQueriesMock = jest.fn();

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
      onDeleteShift,
      onRetrySync,
      open,
      targetDate,
    }: {
      onCreateShift: (date: Date) => void;
      onDeleteShift: (shiftId: string) => void;
      onRetrySync: (shiftId: string) => Promise<void> | void;
      open: boolean;
      targetDate: Date;
    }) =>
      open ? (
        <div role="dialog">
          <p>日別シフトモーダル</p>
          <button type="button" onClick={() => onCreateShift(targetDate)}>
            この日に追加
          </button>
          <button type="button" onClick={() => onDeleteShift("shift-1")}>
            シフトを削除
          </button>
          <button type="button" onClick={() => void onRetrySync("shift-1")}>
            同期を再試行
          </button>
        </div>
      ) : null,
  ),
}));

jest.mock("sonner", () => ({
  toast: Object.assign(
    jest.fn(() => "undo-toast-1"),
    {
      dismiss: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    },
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

jest.mock("@/lib/query/queries/shift-confirmation", () => ({
  useUnconfirmedShiftCountQuery: jest.fn(),
}));

jest.mock("@/lib/query/optimistic-shifts", () => ({
  removeShiftsFromMonthCachesOptimistically: jest.fn(),
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
const mockedUseUnconfirmedShiftCountQuery =
  useUnconfirmedShiftCountQuery as jest.MockedFunction<
    typeof useUnconfirmedShiftCountQuery
  >;
const mockedRemoveShiftsFromMonthCachesOptimistically =
  removeShiftsFromMonthCachesOptimistically as jest.MockedFunction<
    typeof removeShiftsFromMonthCachesOptimistically
  >;
const mockToast = toast as jest.MockedFunction<typeof toast> &
  jest.Mocked<Pick<typeof toast, "dismiss" | "error" | "success">>;

describe("DashboardPageClient", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    pushMock.mockReset();
    replaceMock.mockReset();
    mockedUseGoogleTokenExpiredSignOut.mockReset();
    mockedUseMonthShifts.mockReset();
    mockedGetBrowserQueryClient.mockReset();
    mockedUsePayrollSummaryAmountQuery.mockReset();
    mockedUseUnconfirmedShiftCountQuery.mockReset();
    mockedRemoveShiftsFromMonthCachesOptimistically.mockReset();
    cancelQueriesMock.mockReset();
    cancelQueriesMock.mockResolvedValue(undefined);
    invalidateQueriesMock.mockReset();
    invalidateQueriesMock.mockResolvedValue(undefined);
    mockToast.mockClear();
    mockToast.dismiss.mockClear();
    mockToast.error.mockClear();
    mockToast.success.mockClear();

    mockedUseGoogleTokenExpiredSignOut.mockReturnValue({
      isSignOutScheduled: false,
      scheduleSignOut: jest.fn(),
    });
    mockedGetBrowserQueryClient.mockReturnValue({
      cancelQueries: cancelQueriesMock,
      invalidateQueries: invalidateQueriesMock,
    } as unknown as ReturnType<typeof getBrowserQueryClient>);
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
    mockedUseUnconfirmedShiftCountQuery.mockReturnValue({
      data: 0,
      isFetching: false,
    } as ReturnType<typeof useUnconfirmedShiftCountQuery>);
    mockedRemoveShiftsFromMonthCachesOptimistically.mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("SSR の未確定件数を表示し、背景更新中は最新件数と更新フロートを表示する", async () => {
    const props = {
      currentUserId: "user-1",
      initialMonthShifts: [],
      initialMonthStartDate: "2026-07-01",
      initialMonthEndDate: "2026-07-31",
      initialUnconfirmedShiftCount: 2,
      initialUnconfirmedShiftCountVersion: "dashboard-count-v1",
      initialNextPaymentAmount: null,
      todayDate: "2026-07-15",
    };

    mockedUseUnconfirmedShiftCountQuery.mockReturnValue({
      data: 2,
      isFetching: false,
    } as ReturnType<typeof useUnconfirmedShiftCountQuery>);

    const { rerender } = render(<DashboardPageClient {...props} />);
    const confirmPageButton = screen.getByRole("button", {
      name: "シフト確定ページへ",
    });
    const notice = confirmPageButton.closest("[data-slot='card']");
    if (notice === null) {
      throw new Error("未確定シフトのお知らせカードが見つかりません");
    }

    expect(notice).toHaveTextContent("本日以前の未確定シフトが 2 件あります。");

    mockedUseUnconfirmedShiftCountQuery.mockReturnValue({
      data: 3,
      isFetching: true,
    } as ReturnType<typeof useUnconfirmedShiftCountQuery>);

    await act(async () => {
      rerender(<DashboardPageClient {...props} />);
    });

    expect(mockedUseUnconfirmedShiftCountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      initialDataVersion: "dashboard-count-v1",
      initialData: 2,
    });
    expect(notice).toHaveTextContent("本日以前の未確定シフトが 3 件あります。");
    expect(screen.getByLabelText("更新中")).toHaveClass(
      "fixed",
      "pointer-events-none",
    );
    expect(
      screen.queryByText("ダッシュボードを読み込み中..."),
    ).not.toBeInTheDocument();
  });

  it("同一ユーザーへの再訪では新しい SSR 件数と version を未確定件数 query に渡す", async () => {
    const oldVisitProps = {
      currentUserId: "user-1",
      initialMonthShifts: [],
      initialMonthStartDate: "2026-07-01",
      initialMonthEndDate: "2026-07-31",
      initialUnconfirmedShiftCount: 1,
      initialUnconfirmedShiftCountVersion: "dashboard-count-v1",
      initialNextPaymentAmount: null,
      todayDate: "2026-07-15",
    };
    const revisitedProps = {
      ...oldVisitProps,
      initialUnconfirmedShiftCount: 4,
      initialUnconfirmedShiftCountVersion: "dashboard-count-v2",
    };

    mockedUseUnconfirmedShiftCountQuery.mockImplementation(
      ({ initialData, initialDataVersion }) =>
        ({
          data: initialDataVersion === "dashboard-count-v1" ? 1 : initialData,
          isFetching: false,
        }) as ReturnType<typeof useUnconfirmedShiftCountQuery>,
    );

    const { rerender } = render(<DashboardPageClient {...oldVisitProps} />);
    const notice = screen
      .getByRole("button", { name: "シフト確定ページへ" })
      .closest("[data-slot='card']");
    if (notice === null) {
      throw new Error("未確定シフトのお知らせカードが見つかりません");
    }
    expect(notice).toHaveTextContent("本日以前の未確定シフトが 1 件あります。");

    await act(async () => {
      rerender(<DashboardPageClient {...revisitedProps} />);
    });

    expect(notice).toHaveTextContent("本日以前の未確定シフトが 4 件あります。");
    expect(mockedUseUnconfirmedShiftCountQuery).toHaveBeenLastCalledWith({
      userId: "user-1",
      initialDataVersion: "dashboard-count-v2",
      initialData: 4,
    });
  });

  it("月次シフトの再取得中はカレンダー領域に更新フロートを表示する", () => {
    mockedUseMonthShifts.mockReturnValue({
      shifts: [],
      displayMonth: new Date("2026-07-01T00:00:00.000Z"),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: true,
      isPlaceholderData: false,
      errorMessage: null,
      reload: jest.fn(),
    } as ReturnType<typeof useMonthShifts>);

    const props = {
      currentUserId: "user-1",
      initialMonthShifts: [],
      initialMonthStartDate: "2026-07-01",
      initialMonthEndDate: "2026-07-31",
      initialUnconfirmedShiftCount: 0,
      initialUnconfirmedShiftCountVersion: "dashboard-count-v1",
      initialNextPaymentAmount: null,
      todayDate: "2026-07-15",
    };
    const { rerender } = render(<DashboardPageClient {...props} />);

    const refreshFloating = screen.getByLabelText("更新中");
    expect(refreshFloating.tagName).toBe("ASIDE");
    expect(refreshFloating).toHaveClass("fixed", "pointer-events-none");
    expect(within(refreshFloating).getByText("更新中")).toBeInTheDocument();
    expect(
      within(refreshFloating).getByText("更新中").parentElement,
    ).toHaveAttribute("aria-busy", "true");
    const calendarRegion = screen
      .getByRole("button", { name: "次月へ移動" })
      .closest("[aria-busy]");
    expect(calendarRegion).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText("カレンダーの最新データを確認中です。"),
    ).not.toBeInTheDocument();

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
    rerender(<DashboardPageClient {...props} />);

    expect(screen.queryByLabelText("更新中")).not.toBeInTheDocument();
  });

  it("initialNextPaymentAmount が null で初回取得が失敗した場合は翌月支給額カードにフォールバックのエラー文言を表示する", () => {
    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    expect(mockedUsePayrollSummaryAmountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-08",
      initialData: undefined,
      refetchOnMount: "always",
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
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={initialNextPaymentAmount}
        todayDate="2026-07-15"
      />,
    );

    expect(mockedUsePayrollSummaryAmountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-08",
      initialData: initialNextPaymentAmount,
      refetchOnMount: "always",
    });
  });

  it("古い SSR payload を受け取っても、シフトと翌月支給額をマウント時に再取得する", () => {
    const initialMonthShifts: MonthShift[] = [];
    const initialNextPaymentAmount = {
      month: "2026-08",
      totalWage: 123456,
    };

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={initialMonthShifts}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={initialNextPaymentAmount}
        todayDate="2026-07-15"
      />,
    );

    expect(mockedUseMonthShifts).toHaveBeenCalledWith(
      expect.any(Date),
      expect.objectContaining({
        cacheUserKey: "user-1",
        initialShifts: initialMonthShifts,
        initialStartDate: "2026-07-01",
        initialEndDate: "2026-07-31",
        deferEstimate: true,
        refetchOnMount: "always",
      }),
    );
    expect(mockedUsePayrollSummaryAmountQuery).toHaveBeenCalledWith({
      userId: "user-1",
      month: "2026-08",
      initialData: initialNextPaymentAmount,
      refetchOnMount: "always",
    });
  });

  it("月移動は URL を置換するが、一括登録には月を引き継がない", () => {
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
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "次月へ移動" }));
    expect(replaceMock).toHaveBeenCalledWith("/my?month=2026-08");

    fireEvent.click(screen.getByRole("button", { name: "一括登録" }));
    expect(pushMock).toHaveBeenCalledWith("/my/shifts/bulk");
  });
  it("シフトの有無にかかわらず日付クリックで日別モーダルを開く", () => {
    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
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
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
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
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
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
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新規シフト登録" }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/my/shifts/new?date=2026-08-15&month=2026-08",
    );
  });

  it("単体シフトの削除失敗時は楽観状態を復元し、エラートーストを表示する", async () => {
    const rollback = jest.fn();
    const unhandledRejection = jest.fn();
    window.addEventListener("unhandledrejection", unhandledRejection);
    mockedRemoveShiftsFromMonthCachesOptimistically.mockReturnValue(rollback);
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: "削除処理に失敗しました" }),
      } as Response),
    });

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "シフトを削除" }));
    expect(rollback).not.toHaveBeenCalled();
    expect(cancelQueriesMock).toHaveBeenCalledWith({
      queryKey: ["shifts", "month"],
    });
    expect(
      mockedRemoveShiftsFromMonthCachesOptimistically,
    ).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      mockedRemoveShiftsFromMonthCachesOptimistically,
    ).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      "シフトを削除しました。",
      expect.objectContaining({
        action: expect.objectContaining({ label: "元に戻す" }),
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/shifts/shift-1", {
      method: "DELETE",
    });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith(
      "シフトの削除に失敗しました。",
      expect.objectContaining({
        description:
          "シフトの削除に失敗しました。 時間をおいてから再実行してください。",
        duration: 6000,
      }),
    );
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
    window.removeEventListener("unhandledrejection", unhandledRejection);
  });

  it("日別モーダルの元に戻すでは楽観削除を復元し、削除APIを呼ばない", async () => {
    const rollback = jest.fn();
    const fetchMock = jest.fn();
    mockedRemoveShiftsFromMonthCachesOptimistically.mockReturnValue(rollback);
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: fetchMock,
    });

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "シフトを削除" }));

    await act(async () => {
      await Promise.resolve();
    });

    const toastOptions = mockToast.mock.calls.find(
      ([message]) => message === "シフトを削除しました。",
    )?.[1] as {
      action: { onClick: (event: MouseEvent<HTMLButtonElement>) => void };
    };

    act(() => {
      toastOptions.action.onClick({} as MouseEvent<HTMLButtonElement>);
      jest.advanceTimersByTime(4000);
    });

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockToast.dismiss).toHaveBeenCalledWith("undo-toast-1");
  });

  it("日別モーダルの再同期は対象シフトの再試行APIを呼ぶ", async () => {
    const reload = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true } as Response);
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: fetchMock,
    });
    mockedUseMonthShifts.mockReturnValue({
      shifts: [],
      displayMonth: new Date("2026-07-01T00:00:00.000Z"),
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      isPlaceholderData: false,
      errorMessage: null,
      reload,
    } as ReturnType<typeof useMonthShifts>);

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "同期を再試行" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/shifts/shift-1/retry-sync", {
      method: "POST",
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith(
      "Google Calendar へ再同期しました。",
    );
  });

  it("does not schedule dashboard deletion after unmounting during query cancellation", async () => {
    let resolveCancellation!: () => void;
    cancelQueriesMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCancellation = resolve;
        }),
    );
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });

    const { unmount } = render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "シフトを削除" }));

    unmount();
    await act(async () => {
      resolveCancellation();
      await Promise.resolve();
      jest.advanceTimersByTime(4000);
    });

    expect(
      mockedRemoveShiftsFromMonthCachesOptimistically,
    ).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not remove or schedule a dashboard shift when query cancellation fails", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    cancelQueriesMock.mockRejectedValue(new Error("cancel failed"));
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });

    render(
      <DashboardPageClient
        currentUserId="user-1"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-07-01"
        initialMonthEndDate="2026-07-31"
        initialUnconfirmedShiftCount={0}
        initialUnconfirmedShiftCountVersion="dashboard-count-v1"
        initialNextPaymentAmount={null}
        todayDate="2026-07-15"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "シフトありの日を開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "シフトを削除" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      mockedRemoveShiftsFromMonthCachesOptimistically,
    ).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
