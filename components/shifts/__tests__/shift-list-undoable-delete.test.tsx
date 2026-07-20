import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { MouseEvent } from "react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { type Action, type ExternalToast, toast } from "sonner";
import { ShiftListPageClient } from "@/components/shifts/shift-list-page-client";
import { createQueryClient } from "@/lib/query/query-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe("ShiftListPageClient Undo deletion", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockToast.mockClear();
    mockToast.dismiss.mockClear();
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(async (input: string) => {
        if (input.startsWith("/api/shifts?")) {
          return response({
            data: [
              {
                id: "shift-1",
                workplaceId: "workplace-1",
                date: "2026-03-10T00:00:00.000Z",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
                breakMinutes: 0,
                shiftType: "NORMAL",
                comment: null,
                googleSyncStatus: "SUCCESS",
                googleSyncError: null,
                googleSyncedAt: null,
                workedMinutes: 480,
                estimatedPay: 8000,
                workplace: {
                  id: "workplace-1",
                  name: "勤務先A",
                  color: "#3366FF",
                  type: "GENERAL",
                },
                lessonRange: null,
              },
              {
                id: "shift-2",
                workplaceId: "workplace-2",
                date: "2026-03-11T00:00:00.000Z",
                startTime: "1970-01-01T10:00:00.000Z",
                endTime: "1970-01-01T18:00:00.000Z",
                breakMinutes: 0,
                shiftType: "NORMAL",
                comment: null,
                googleSyncStatus: "SUCCESS",
                googleSyncError: null,
                googleSyncedAt: null,
                workedMinutes: 480,
                estimatedPay: 9000,
                workplace: {
                  id: "workplace-2",
                  name: "勤務先B",
                  color: "#FF6633",
                  type: "GENERAL",
                },
                lessonRange: null,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${input}`);
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("removes selected shifts immediately, does not call DELETE during Undo, and restores them", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ShiftListPageClient
          currentUserId="user-test"
          initialMonth="2026-03"
          initialMonthShifts={[]}
          initialMonthStartDate="2026-02-01"
          initialMonthEndDate="2026-02-28"
          todayDate="2026-03-15"
        />
      </QueryClientProvider>,
    );

    const findRowByWorkplace = (workplaceName: string) =>
      screen
        .getAllByRole("row")
        .find((row) => within(row).queryByText(workplaceName));
    const getTargetRow = () => {
      const row = findRowByWorkplace("勤務先A");
      if (!row) throw new Error("勤務先Aのシフト行が見つかりません。");
      return row;
    };

    await waitFor(() => expect(getTargetRow()).toBeInTheDocument());
    expect(findRowByWorkplace("勤務先B")).toBeInTheDocument();
    await user.click(within(getTargetRow()).getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "選択したシフトを削除" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(findRowByWorkplace("勤務先A")).toBeUndefined());
    expect(findRowByWorkplace("勤務先B")).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      "1件のシフトを削除予定にしました。",
      expect.objectContaining({
        action: expect.objectContaining({ label: "元に戻す" }),
      }),
    );

    const deleteCalls = (globalThis.fetch as jest.Mock).mock.calls.filter(
      ([url, init]) => url === "/api/shifts" && init?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(0);

    const options = mockToast.mock.calls[0]?.[1] as ExternalToast;
    const action = options.action as Action;
    act(() => action.onClick({} as MouseEvent<HTMLButtonElement>));

    await waitFor(() => expect(getTargetRow()).toBeInTheDocument());
    expect(findRowByWorkplace("勤務先B")).toBeInTheDocument();
    expect(deleteCalls).toHaveLength(0);
  });
});
