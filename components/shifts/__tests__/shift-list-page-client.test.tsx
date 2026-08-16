import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShiftListPageClient } from "@/components/shifts/shift-list-page-client";
import { clearMonthShiftsCache } from "@/hooks/use-month-shifts";
import { createQueryClient } from "@/lib/query/query-client";

const pushMock = jest.fn();
const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

jest.mock("sonner", () => ({
  toast: Object.assign(
    jest.fn(() => "toast-1"),
    {
      dismiss: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  ),
}));

type MockToast = jest.MockedFunction<typeof toast> &
  jest.Mocked<Pick<typeof toast, "dismiss" | "success" | "error" | "info">>;

const mockToast = toast as MockToast;

type TestShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  workplaceName: string;
  workplaceType?: "GENERAL" | "CRAM_SCHOOL";
  shiftType?: "NORMAL" | "LESSON";
  comment?: string | null;
  breakMinutes?: number;
  transportationAllowance?: number;
  estimatedPay?: number | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createShift(value: TestShift) {
  return {
    id: value.id,
    workplaceId: `workplace-${value.id}`,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
    breakMinutes: value.breakMinutes ?? 0,
    transportationAllowance: value.transportationAllowance ?? 0,
    shiftType: value.shiftType ?? "NORMAL",
    comment: value.comment ?? null,
    googleSyncStatus: "SUCCESS" as const,
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 480,
    estimatedPay: value.estimatedPay ?? 8000,
    workplace: {
      id: `workplace-${value.id}`,
      name: value.workplaceName,
      color: "#3366FF",
      type: value.workplaceType ?? "GENERAL",
    },
    lessonRange: null,
  };
}

function getBodyRows(): HTMLTableRowElement[] {
  const tbody = screen.getByTestId("shift-list-table-body");
  return Array.from(tbody.querySelectorAll("tr"));
}

function renderShiftListPage(
  override: Partial<ComponentProps<typeof ShiftListPageClient>> = {},
) {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ShiftListPageClient
        currentUserId="user-test"
        initialMonth="2026-03"
        initialMonthShifts={[]}
        initialMonthStartDate="2026-02-01"
        initialMonthEndDate="2026-02-28"
        todayDate="2026-03-15"
        {...override}
      />
    </QueryClientProvider>,
  );
}

describe("ShiftListPageClient", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockToast.info.mockReset();
    mockToast.mockReset();
    mockToast.dismiss.mockReset();
    clearMonthShiftsCache();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  it("shows transportation allowance for each listed shift", () => {
    renderShiftListPage({
      initialMonthShifts: [
        createShift({
          id: "shift-transport",
          date: "2026-03-18T00:00:00.000Z",
          startTime: "1970-01-01T09:00:00.000Z",
          endTime: "1970-01-01T18:00:00.000Z",
          workplaceName: "勤務先A",
          transportationAllowance: 480,
        }),
      ],
      initialMonthStartDate: "2026-03-01",
      initialMonthEndDate: "2026-03-31",
    });

    expect(screen.getByText("480円")).toBeInTheDocument();
  });

  it("shows default date/time ascending order and supports workplace sort", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith("/api/shifts?")) {
        return jsonResponse({
          data: [
            createShift({
              id: "shift-1",
              date: "2026-03-12T00:00:00.000Z",
              startTime: "1970-01-01T13:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              workplaceName: "Zeta",
            }),
            createShift({
              id: "shift-2",
              date: "2026-03-10T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              workplaceName: "Alpha",
            }),
            createShift({
              id: "shift-3",
              date: "2026-03-10T00:00:00.000Z",
              startTime: "1970-01-01T08:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              workplaceName: "Beta",
            }),
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderShiftListPage();

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    let rows = getBodyRows();
    expect(rows[0]).toHaveTextContent("Beta");

    await user.click(screen.getByRole("button", { name: "勤務先で並び替え" }));

    await waitFor(() => {
      rows = getBodyRows();
      expect(rows[0]).toHaveTextContent("Alpha");
    });

    await user.click(screen.getByRole("button", { name: "勤務先で並び替え" }));

    await waitFor(() => {
      rows = getBodyRows();
      expect(rows[0]).toHaveTextContent("Zeta");
    });
  });

  it("navigates to edit page with month and returnTo query", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith("/api/shifts?")) {
        return jsonResponse({
          data: [
            createShift({
              id: "shift-1",
              date: "2026-03-10T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              workplaceName: "勤務先A",
              comment: "研修",
            }),
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderShiftListPage();

    await waitFor(() => {
      expect(screen.getByText("勤務先A (研修)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/my/shifts/shift-1/edit?month=2026-03&returnTo=list",
    );
  });

  it("sends selected shift ids to bulk delete API after the Undo window", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const fetchMock = globalThis.fetch as jest.Mock;

    let shifts = [
      createShift({
        id: "shift-1",
        date: "2026-03-10T00:00:00.000Z",
        startTime: "1970-01-01T09:00:00.000Z",
        endTime: "1970-01-01T17:00:00.000Z",
        workplaceName: "勤務先A",
      }),
      createShift({
        id: "shift-2",
        date: "2026-03-11T00:00:00.000Z",
        startTime: "1970-01-01T09:00:00.000Z",
        endTime: "1970-01-01T17:00:00.000Z",
        workplaceName: "勤務先B",
      }),
    ];

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string; body?: string }) => {
        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: shifts });
        }

        if (input === "/api/shifts" && init?.method === "DELETE") {
          const body = JSON.parse((init.body ?? "{}") as string) as {
            shiftIds?: string[];
          };

          const deletingIds = body.shiftIds ?? [];
          shifts = shifts.filter(
            (shift) => deletingIds.includes(shift.id) === false,
          );

          return jsonResponse({
            deletedCount: deletingIds.length,
            deletedIds: deletingIds,
          });
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    renderShiftListPage();

    await waitFor(() => {
      expect(screen.getByText("勤務先A")).toBeInTheDocument();
      expect(screen.getByText("勤務先B")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);
    await user.click(checkboxes[2]);

    await user.click(
      screen.getByRole("button", { name: "選択したシフトを削除" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/shifts",
      expect.objectContaining({ method: "DELETE" }),
    );
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/shifts" &&
          (options as { method?: string } | undefined)?.method === "DELETE",
      );

      expect(deleteCall).toBeTruthy();

      const body = JSON.parse(
        ((deleteCall?.[1] as { body?: string } | undefined)?.body ??
          "{}") as string,
      ) as {
        shiftIds: string[];
      };

      expect(body.shiftIds).toEqual(
        expect.arrayContaining(["shift-1", "shift-2"]),
      );
    });
    jest.useRealTimers();
  });

  it("renders overnight shift time range with 翌 prefix", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith("/api/shifts?")) {
        return jsonResponse({
          data: [
            createShift({
              id: "shift-overnight",
              date: "2026-03-10T00:00:00.000Z",
              startTime: "1970-01-01T18:00:00.000Z",
              endTime: "1970-01-01T01:00:00.000Z",
              workplaceName: "勤務先A",
            }),
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderShiftListPage();

    await waitFor(() => {
      expect(screen.getByText("18:00 - 翌01:00")).toBeInTheDocument();
    });
  });

  it("keeps the previous month table visible while the next month is refreshing", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    let resolveAprilResponse!: (value: Response) => void;
    const aprilResponse = new Promise<Response>((resolve) => {
      resolveAprilResponse = resolve;
    });

    fetchMock.mockImplementation((input: string) => {
      if (input.startsWith("/api/shifts?")) {
        const url = new URL(input, "http://localhost");
        const startDate = url.searchParams.get("startDate");

        if (startDate === "2026-04-01") {
          return aprilResponse;
        }
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderShiftListPage({
      initialMonth: "2026-03",
      initialMonthShifts: [
        createShift({
          id: "shift-march",
          date: "2026-03-10T00:00:00.000Z",
          startTime: "1970-01-01T09:00:00.000Z",
          endTime: "1970-01-01T17:00:00.000Z",
          workplaceName: "勤務先A",
        }),
      ],
      initialMonthStartDate: "2026-03-01",
      initialMonthEndDate: "2026-03-31",
    });

    expect(screen.getByText("勤務先A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "次月" }));

    expect(replaceMock).toHaveBeenCalledWith("/my/shifts/list?month=2026-04");

    expect(screen.getByText("勤務先A")).toBeInTheDocument();
    expect(screen.getByText("2026年3月")).toBeInTheDocument();
    expect(screen.getByText("最新データを更新中...")).toBeInTheDocument();
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();
    expect(
      screen.queryByText("シフト一覧の最新データを確認中です。"),
    ).not.toBeInTheDocument();

    resolveAprilResponse(
      jsonResponse({
        data: [
          createShift({
            id: "shift-april",
            date: "2026-04-12T00:00:00.000Z",
            startTime: "1970-01-01T10:00:00.000Z",
            endTime: "1970-01-01T18:00:00.000Z",
            workplaceName: "勤務先B",
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("勤務先B")).toBeInTheDocument();
    });
    expect(screen.getByText("2026年4月")).toBeInTheDocument();
    expect(screen.queryByText("勤務先A")).not.toBeInTheDocument();
  });

  it("clears the selected shifts and announces the count when changing month", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith("/api/shifts?")) {
        return jsonResponse({
          data: [
            createShift({
              id: "shift-1",
              date: "2026-03-10T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              workplaceName: "勤務先A",
            }),
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderShiftListPage();

    await waitFor(() => {
      expect(screen.getByText("勤務先A")).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "次月" }));

    expect(mockToast.info).toHaveBeenCalledWith(
      "月を変更したため選択を解除しました。",
      { description: "1件の選択を解除しました。" },
    );
  });
});
