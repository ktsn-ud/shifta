import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import type {
  ConfirmedShiftWorkplaceGroup,
  UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { getBrowserQueryClient } from "@/lib/query/query-client";
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

function renderWithQueryProvider(ui: ReactElement) {
  const queryClient = getBrowserQueryClient();
  queryClient.clear();

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

function getDesktopLayoutElements() {
  const pageSection = screen
    .getByRole("heading", { name: "シフト確定" })
    .closest("section");
  const unconfirmedSection = screen
    .getByRole("heading", { name: "未確定シフト" })
    .closest("section");
  const confirmedSection = screen
    .getByRole("heading", { name: "今月の確定済みシフト" })
    .closest("section");

  if (
    !(pageSection instanceof HTMLElement) ||
    !(unconfirmedSection instanceof HTMLElement) ||
    !(confirmedSection instanceof HTMLElement)
  ) {
    throw new Error("shift confirm layout elements were not found");
  }

  const unconfirmedListWrapper = unconfirmedSection.lastElementChild;
  const confirmedListWrapper = confirmedSection.lastElementChild;
  const gridWrapper = unconfirmedSection.parentElement;
  const overlayContent = gridWrapper?.parentElement;
  const overlayRoot = overlayContent?.parentElement;

  if (
    !(unconfirmedListWrapper instanceof HTMLElement) ||
    !(confirmedListWrapper instanceof HTMLElement) ||
    !(gridWrapper instanceof HTMLElement) ||
    !(overlayContent instanceof HTMLElement) ||
    !(overlayRoot instanceof HTMLElement)
  ) {
    throw new Error("shift confirm layout wrappers were not found");
  }

  return {
    pageSection,
    overlayRoot,
    overlayContent,
    gridWrapper,
    unconfirmedListWrapper,
    confirmedListWrapper,
  };
}

describe("shift confirm page and card flow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    (toast.success as jest.Mock).mockReset();
    (toast.error as jest.Mock).mockReset();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  it("loads and renders initial unconfirmed/confirmed shifts", () => {
    const initialConfirmedShiftGroups: ConfirmedShiftWorkplaceGroup[] = [
      {
        workplaceId: "workplace-1",
        workplaceName: "コンビニA",
        workplaceColor: "#FF5733",
        shifts: [
          {
            id: "shift-2",
            date: "2026年3月6日(金)",
            comment: null,
            startTime: "09:00",
            endTime: "15:00",
            workDurationHours: 5.5,
            wage: 6500,
          },
        ],
      },
    ];

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialConfirmedShiftGroups={initialConfirmedShiftGroups}
      />,
    );

    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByText("2026年3月6日(金)")).toBeInTheDocument();
    expect(screen.getByText("09:00 ～ 15:00（実働5.5h）")).toBeInTheDocument();
    expect(screen.getByText(/6,500/)).toBeInTheDocument();
  });

  it("shows empty states when no initial shifts are passed", () => {
    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[]}
        initialConfirmedShiftGroups={[]}
      />,
    );

    expect(
      screen.getByText("未確定シフトはまだありません"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("今月の確定済みシフトはまだありません"),
    ).toBeInTheDocument();
  });

  it("renders overnight time range in confirmed shift list", () => {
    const initialConfirmedShiftGroups: ConfirmedShiftWorkplaceGroup[] = [
      {
        workplaceId: "workplace-1",
        workplaceName: "コンビニA",
        workplaceColor: "#FF5733",
        shifts: [
          {
            id: "shift-2",
            date: "2026年3月6日(金)",
            comment: null,
            startTime: "18:00",
            endTime: "01:00",
            workDurationHours: 6.0,
            wage: 7200,
          },
        ],
      },
    ];

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[]}
        initialConfirmedShiftGroups={initialConfirmedShiftGroups}
      />,
    );

    expect(
      screen.getByText("18:00 ～ 翌01:00（実働6.0h）"),
    ).toBeInTheDocument();
  });

  it("uses a height-constrained desktop layout with independent scroll wrappers during refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const unconfirmedReload = createDeferred<Response>();
    const confirmedReload = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (
          input === "/api/shifts/shift-1/confirm" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({
            id: "shift-1",
            workplaceId: "workplace-1",
            isConfirmed: true,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            syncStatus: "pending",
          });
        }

        if (input === "/api/shifts/unconfirmed") {
          return unconfirmedReload.promise;
        }

        if (input === "/api/shifts/confirmed-current-month") {
          return confirmedReload.promise;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialConfirmedShiftGroups={[]}
      />,
    );

    const {
      pageSection,
      overlayRoot,
      overlayContent,
      gridWrapper,
      unconfirmedListWrapper,
      confirmedListWrapper,
    } = getDesktopLayoutElements();

    expect(pageSection).toHaveClass(
      "md:h-[calc(100svh-var(--header-height))]",
      "md:min-h-0",
      "md:overflow-hidden",
    );
    expect(overlayRoot).toHaveClass("rounded-xl", "md:min-h-0", "md:flex-1");
    expect(overlayContent).toHaveClass(
      "md:flex",
      "md:h-full",
      "md:min-h-0",
      "md:flex-col",
    );
    expect(gridWrapper).toHaveClass(
      "md:grid",
      "md:h-full",
      "md:min-h-0",
      "md:flex-1",
      "md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]",
    );
    expect(unconfirmedListWrapper).toHaveClass(
      "md:min-h-0",
      "md:flex-1",
      "md:overflow-y-auto",
    );
    expect(confirmedListWrapper).toHaveClass(
      "md:min-h-0",
      "md:flex-1",
      "md:overflow-y-auto",
    );
    expect(unconfirmedListWrapper).not.toBe(confirmedListWrapper);

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(overlayRoot).toHaveAttribute("aria-busy", "true");
    });

    const overlayPane = overlayRoot.lastElementChild;
    if (!(overlayPane instanceof HTMLElement)) {
      throw new Error("refresh overlay pane was not rendered");
    }
    expect(overlayPane).toHaveClass(
      "absolute",
      "inset-0",
      "z-10",
      "flex",
      "items-center",
      "justify-center",
      "pointer-events-none",
    );
    expect(overlayContent).not.toHaveClass("pointer-events-none");

    unconfirmedReload.resolve(jsonResponse({ shifts: [] }));
    confirmedReload.resolve(jsonResponse({ shifts: [] }));

    await waitFor(() => {
      expect(overlayRoot).not.toHaveAttribute("aria-busy");
    });
  });

  it("confirms a shift with edited values", async () => {
    const user = userEvent.setup();
    const onActionCompleted = jest.fn(async () => undefined);
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
      expect(onActionCompleted).toHaveBeenCalled();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/shift-1/confirm",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("シフトを確定しました。");
  });

  it("shows success toast without waiting for post-confirm reload", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    let resolveReload: (() => void) | undefined;
    const onActionCompleted = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReload = resolve;
        }),
    );

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
    expect(onActionCompleted).toHaveBeenCalledWith({
      shiftId: "shift-1",
      workplaceId: "workplace-1",
      workplaceName: "コンビニA",
      workplaceColor: "#FF5733",
      date: "2026年3月5日(木)",
      startTime: "10:00",
      endTime: "18:00",
      comment: null,
    });
    expect(
      screen.getByRole("button", {
        name: "確定",
      }),
    ).toBeEnabled();

    resolveReload?.();
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
        expect.objectContaining({
          method: "PATCH",
        }),
      );
    });
  });

  it("shows a provisional confirmed row before the background reload completes", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const unconfirmedReload = createDeferred<Response>();
    const confirmedReload = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (
          input === "/api/shifts/shift-1/confirm" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({
            id: "shift-1",
            workplaceId: "workplace-1",
            isConfirmed: true,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            syncStatus: "pending",
          });
        }

        if (input === "/api/shifts/unconfirmed") {
          return unconfirmedReload.promise;
        }

        if (input === "/api/shifts/confirmed-current-month") {
          return confirmedReload.promise;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialConfirmedShiftGroups={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(
        screen.getByText("未確定シフトはまだありません"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("10:00 ～ 18:00（実働計算中）"),
      ).toBeInTheDocument();
      expect(screen.getByText("計算中")).toBeInTheDocument();
    });

    unconfirmedReload.resolve(jsonResponse({ shifts: [] }));
    confirmedReload.resolve(
      jsonResponse({
        shifts: [
          {
            id: "shift-1",
            comment: null,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            workDurationHours: 7,
            wage: 8400,
            isConfirmed: true,
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
      expect(
        screen.getByText("10:00 ～ 18:00（実働7.0h）"),
      ).toBeInTheDocument();
      expect(screen.getByText(/8,400/)).toBeInTheDocument();
    });
  });

  it("allows confirming another shift while the background refresh overlay is visible", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const unconfirmedReload = createDeferred<Response>();
    const confirmedReload = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (
          input === "/api/shifts/shift-1/confirm" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({
            id: "shift-1",
            workplaceId: "workplace-1",
            isConfirmed: true,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            syncStatus: "pending",
          });
        }

        if (
          input === "/api/shifts/shift-2/confirm" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({
            id: "shift-2",
            workplaceId: "workplace-1",
            isConfirmed: true,
            date: "2026-03-06",
            startTime: "12:00",
            endTime: "20:00",
            breakMinutes: 45,
            syncStatus: "pending",
          });
        }

        if (input === "/api/shifts/unconfirmed") {
          return unconfirmedReload.promise;
        }

        if (input === "/api/shifts/confirmed-current-month") {
          return confirmedReload.promise;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderWithQueryProvider(
      <ShiftConfirmPageClient
        currentUserId="user-test"
        initialUnconfirmedShifts={[
          createUnconfirmedShift(),
          createUnconfirmedShift({
            id: "shift-2",
            date: "2026年3月6日(金)",
            startTime: "12:00",
            endTime: "20:00",
            breakMinutes: 45,
          }),
        ]}
        initialConfirmedShiftGroups={[]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "確定" })[0]);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === "/api/shifts/shift-1/confirm" && init?.method === "PATCH",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        screen.getByText("10:00 ～ 18:00（実働計算中）"),
      ).toBeInTheDocument();
      expect(screen.getByText("2026年3月6日(金)")).toBeInTheDocument();
    });

    const refreshingRegion = screen
      .getByRole("heading", { name: "シフト確定" })
      .closest("section");
    if (!(refreshingRegion instanceof HTMLElement)) {
      throw new Error("shift confirm page section was not found");
    }
    expect(refreshingRegion).toContainElement(
      screen.getByText("最新データを更新中..."),
    );

    const unconfirmedSection = screen
      .getByRole("heading", { name: "未確定シフト" })
      .closest("section");
    if (!(unconfirmedSection instanceof HTMLElement)) {
      throw new Error("unconfirmed shifts section was not found");
    }

    await user.click(
      within(unconfirmedSection).getByRole("button", { name: "確定" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            input === "/api/shifts/shift-2/confirm" && init?.method === "PATCH",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        screen.getByText("12:00 ～ 20:00（実働計算中）"),
      ).toBeInTheDocument();
      expect(screen.getAllByText("計算中")).toHaveLength(2);
      expect(
        screen.getByText("未確定シフトはまだありません"),
      ).toBeInTheDocument();
    });

    unconfirmedReload.resolve(jsonResponse({ shifts: [] }));
    confirmedReload.resolve(
      jsonResponse({
        shifts: [
          {
            id: "shift-1",
            comment: null,
            date: "2026-03-05",
            startTime: "10:00",
            endTime: "18:00",
            breakMinutes: 60,
            workDurationHours: 7,
            wage: 8400,
            isConfirmed: true,
            workplace: {
              id: "workplace-1",
              name: "コンビニA",
              color: "#FF5733",
            },
          },
          {
            id: "shift-2",
            comment: null,
            date: "2026-03-06",
            startTime: "12:00",
            endTime: "20:00",
            breakMinutes: 45,
            workDurationHours: 7.25,
            wage: 9100,
            isConfirmed: true,
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
      expect(
        screen.getByText("10:00 ～ 18:00（実働7.0h）"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("12:00 ～ 20:00（実働7.3h）"),
      ).toBeInTheDocument();
      expect(screen.getByText(/8,400/)).toBeInTheDocument();
      expect(screen.getByText(/9,100/)).toBeInTheDocument();
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
