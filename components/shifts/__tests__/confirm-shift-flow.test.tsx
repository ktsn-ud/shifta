import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";
import { toast } from "sonner";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createUnconfirmedShift(
  overrides: Partial<UnconfirmedShiftItem> = {},
): UnconfirmedShiftItem {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026年3月5日(木)",
    workplaceName: "コンビニA",
    workplaceColor: "#FF5733",
    comment: null,
    startTime: "10:00",
    endTime: "18:00",
    breakMinutes: 60,
    ...overrides,
  };
}

function renderWithQueryProvider(
  ui: ReactElement,
  queryClient = getBrowserQueryClient(),
  clearQueryClient = true,
) {
  if (clearQueryClient) {
    queryClient.clear();
  }

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("shift confirm page and card flow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    (toast.success as jest.Mock).mockReset();
    (toast.error as jest.Mock).mockReset();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn().mockResolvedValue(jsonResponse({ shifts: [] })),
    });
  });

  it("keeps SSR cards usable while refreshing the latest unconfirmed shifts in the background", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    const refresh = createDeferred<Response>();

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input === "/api/shifts/unconfirmed") {
        return refresh.promise;
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確定" })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "今月の確定済みシフト" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/unconfirmed",
        expect.anything(),
      );
    });
    expect(screen.getByLabelText("更新中")).toHaveClass(
      "fixed",
      "pointer-events-none",
    );
    expect(
      screen.queryByText("シフト確定情報を読み込み中..."),
    ).not.toBeInTheDocument();

    refresh.resolve(
      jsonResponse({
        shifts: [
          {
            id: "shift-2",
            workplaceId: "workplace-2",
            comment: null,
            date: "2026-03-06",
            startTime: "12:00",
            endTime: "20:00",
            breakMinutes: 60,
            isConfirmed: false,
            workplace: {
              id: "workplace-2",
              name: "書店B",
              color: "#2563EB",
            },
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("書店B")).toBeInTheDocument();
    });
    expect(screen.queryByText("コンビニA")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("更新中")).not.toBeInTheDocument();
  });

  it("同一ユーザーの旧 cache があっても再訪時は新しい version の SSR カードを初期表示する", async () => {
    const queryClient = getBrowserQueryClient();
    const fetchMock = globalThis.fetch as jest.Mock;
    const refresh = createDeferred<Response>();
    const oldVersion = "unconfirmed-shifts-v1";
    const revisitedVersion = "unconfirmed-shifts-v2";
    const oldShift = createUnconfirmedShift({
      id: "shift-old",
      workplaceName: "古い勤務先",
    });
    const latestSsrShift = createUnconfirmedShift({
      id: "shift-latest",
      workplaceName: "新しい勤務先",
      startTime: "12:00",
    });

    queryClient.clear();
    queryClient.setQueryData(
      queryKeys.shifts.unconfirmed({
        userId: "user-test",
        initialDataVersion: oldVersion,
      }),
      [oldShift],
    );
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input === "/api/shifts/unconfirmed") {
        return refresh.promise;
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const { unmount } = renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[latestSsrShift]}
        initialUnconfirmedShiftsVersion={revisitedVersion}
      />,
      queryClient,
      false,
    );

    expect(screen.getByText("新しい勤務先")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
    expect(screen.queryByText("古い勤務先")).not.toBeInTheDocument();
    expect(
      queryClient.getQueryData(
        queryKeys.shifts.unconfirmed({
          userId: "user-test",
          initialDataVersion: oldVersion,
        }),
      ),
    ).toEqual([oldShift]);
    expect(
      queryClient.getQueryData(
        queryKeys.shifts.unconfirmed({
          userId: "user-test",
          initialDataVersion: revisitedVersion,
        }),
      ),
    ).toEqual([latestSsrShift]);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/unconfirmed",
        expect.anything(),
      );
    });

    refresh.resolve(jsonResponse({ shifts: [] }));
    await waitFor(() => {
      expect(screen.queryByLabelText("更新中")).not.toBeInTheDocument();
    });
    unmount();
    queryClient.clear();
  });

  it("shows the unconfirmed empty state when no initial shifts are passed", () => {
    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    expect(
      screen.getByText("未確定シフトはまだありません"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("今月の確定済みシフトはまだありません"),
    ).not.toBeInTheDocument();
  });

  it("keeps card controls usable during a manual refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const refresh = createDeferred<Response>();
    let unconfirmedRequestCount = 0;

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input === "/api/shifts/unconfirmed") {
        unconfirmedRequestCount += 1;
        if (unconfirmedRequestCount === 1) {
          return Promise.resolve(
            jsonResponse({
              shifts: [
                {
                  id: "shift-1",
                  workplaceId: "workplace-1",
                  comment: null,
                  date: "2026-03-05",
                  startTime: "10:00",
                  endTime: "18:00",
                  breakMinutes: 60,
                  isConfirmed: false,
                  workplace: {
                    id: "workplace-1",
                    name: "コンビニA",
                    color: "#FF5733",
                  },
                },
              ],
            }),
          );
        }
        return refresh.promise;
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/unconfirmed",
        expect.anything(),
      );
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
    });

    const refreshButton = screen.getByRole("button", { name: "更新" });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(unconfirmedRequestCount).toBe(2);
    });
    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
      expect(screen.getByText("更新中...")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("開始時刻")).toBeEnabled();
    expect(screen.getByRole("button", { name: "確定" })).toBeEnabled();
    expect(screen.queryByText("最新データを更新中...")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    refresh.resolve(jsonResponse({ shifts: [] }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
      expect(screen.queryByText("更新中...")).not.toBeInTheDocument();
    });
  });

  it("does not restore a confirmed card from an in-flight refresh response", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const refresh = createDeferred<Response>();

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === "/api/shifts/unconfirmed") {
          return refresh.promise;
        }

        if (
          input === "/api/shifts/shift-1/confirm" &&
          init?.method === "PATCH"
        ) {
          return Promise.resolve(
            jsonResponse({
              id: "shift-1",
              isConfirmed: true,
              syncStatus: "pending",
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/unconfirmed",
        expect.anything(),
      );
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(
        screen.getByText("未確定シフトはまだありません"),
      ).toBeInTheDocument();
    });

    refresh.resolve(
      jsonResponse({
        shifts: [
          {
            id: "shift-1",
            workplaceId: "workplace-1",
            comment: null,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            isConfirmed: false,
            workplace: {
              id: "workplace-1",
              name: "コンビニA",
              color: "#FF5733",
            },
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "確定" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("未確定シフトはまだありません"),
    ).toBeInTheDocument();
  });

  it("keeps the displayed cards when a manual refresh fails", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    let unconfirmedRequestCount = 0;

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input !== "/api/shifts/unconfirmed") {
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }

      unconfirmedRequestCount += 1;
      return Promise.resolve(
        unconfirmedRequestCount === 1
          ? jsonResponse({
              shifts: [
                {
                  id: "shift-1",
                  workplaceId: "workplace-1",
                  comment: null,
                  date: "2026-03-05",
                  startTime: "10:00",
                  endTime: "18:00",
                  breakMinutes: 60,
                  isConfirmed: false,
                  workplace: {
                    id: "workplace-1",
                    name: "コンビニA",
                    color: "#FF5733",
                  },
                },
              ],
            })
          : jsonResponse({ message: "unavailable" }, 500),
      );
    });

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        screen.getByText(/未確定シフトの取得に失敗しました/),
      ).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
  });

  it("removes a confirmed card immediately without issuing an additional unconfirmed refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const backgroundRefresh = createDeferred<Response>();

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (input === "/api/shifts/unconfirmed") {
          return backgroundRefresh.promise;
        }

        if (
          input === "/api/shifts/shift-1/confirm" &&
          init?.method === "PATCH"
        ) {
          return Promise.resolve(
            jsonResponse({
              id: "shift-1",
              isConfirmed: true,
              date: "2026-03-05",
              startTime: "10:00",
              endTime: "18:00",
              breakMinutes: 60,
              syncStatus: "pending",
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialUnconfirmedShiftsVersion="unconfirmed-shifts-v1"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/unconfirmed",
        expect.anything(),
      );
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(
        screen.getByText("未確定シフトはまだありません"),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/shift-1/confirm",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => input === "/api/shifts/unconfirmed",
      ),
    ).toHaveLength(1);
    expect(screen.queryByText("最新データを更新中...")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses a single-column form layout on mobile while preserving wider responsive layouts", () => {
    render(<ConfirmShiftCard shift={createUnconfirmedShift()} />);

    const startTimeLabel = screen.getByLabelText("開始時刻").closest("label");
    const endTimeLabel = screen.getByLabelText("終了時刻").closest("label");
    const breakMinutesLabel = screen
      .getByLabelText("休憩時間（分）")
      .closest("label");

    if (
      !(startTimeLabel instanceof HTMLLabelElement) ||
      !(endTimeLabel instanceof HTMLLabelElement) ||
      !(breakMinutesLabel instanceof HTMLLabelElement) ||
      !(startTimeLabel.parentElement instanceof HTMLElement)
    ) {
      throw new Error("shift confirmation form layout elements were not found");
    }

    expect(startTimeLabel.parentElement).toHaveClass(
      "grid",
      "grid-cols-1",
      "sm:grid-cols-2",
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
    );
    expect(startTimeLabel).toHaveClass("min-w-0");
    expect(endTimeLabel).toHaveClass("min-w-0");
    expect(breakMinutesLabel).toHaveClass("min-w-0");
  });

  it("confirms a shift with edited values", async () => {
    const user = userEvent.setup();
    const onActionCompleted = jest.fn();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "shift-1",
        isConfirmed: true,
        date: "2026-03-05",
        startTime: "11:00",
        endTime: "19:00",
        breakMinutes: 30,
        sync: { ok: true, googleEventId: "event-1" },
      }),
    );

    render(
      <ConfirmShiftCard
        shift={createUnconfirmedShift()}
        onActionCompleted={onActionCompleted}
      />,
    );

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "11:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "19:00" },
    });
    fireEvent.change(screen.getByLabelText("休憩時間（分）"), {
      target: { value: "30" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(onActionCompleted).toHaveBeenCalledWith("shift-1");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/shift-1/confirm",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(toast.success).toHaveBeenCalledWith("シフトを確定しました。");
  });

  it("reports a pending Google Calendar sync after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const onActionCompleted = jest.fn();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "shift-1",
        isConfirmed: true,
        date: "2026-03-05",
        startTime: "10:00",
        endTime: "18:00",
        breakMinutes: 60,
        syncStatus: "pending",
      }),
    );

    render(
      <ConfirmShiftCard
        shift={createUnconfirmedShift()}
        onActionCompleted={onActionCompleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("シフトを確定しました。", {
        description: "Google Calendar 同期はバックグラウンドで実行中です。",
      });
    });
    expect(onActionCompleted).toHaveBeenCalledWith("shift-1");
  });

  it("shows overnight confirmation before confirming shift", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "shift-1",
        isConfirmed: true,
        date: "2026-03-05",
        startTime: "20:00",
        endTime: "04:00",
        breakMinutes: 60,
        sync: { ok: true, googleEventId: "event-1" },
      }),
    );

    render(<ConfirmShiftCard shift={createUnconfirmedShift()} />);

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(
      screen.getByRole("heading", { name: "このシフトは日付をまたぎます" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "翌日終了として確定" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/shift-1/confirm",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("shows validation error when start and end time are the same", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    render(<ConfirmShiftCard shift={createUnconfirmedShift()} />);

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(
      screen.getByText("開始時刻と終了時刻は同じ時刻にできません。"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
