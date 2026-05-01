import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { ShiftListPageClient } from "@/components/shifts/shift-list-page-client";
import { clearMonthShiftsCache } from "@/hooks/use-month-shifts";

const pushMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

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
  return render(
    <ShiftListPageClient
      currentUserId="user-test"
      initialMonth="2026-03"
      initialMonthShifts={[]}
      initialMonthStartDate="2026-02-01"
      initialMonthEndDate="2026-02-28"
      {...override}
    />,
  );
}

describe("ShiftListPageClient", () => {
  beforeEach(() => {
    pushMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    clearMonthShiftsCache();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
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

    fireEvent.click(screen.getByText("勤務先A (研修)"));

    expect(pushMock).toHaveBeenCalledWith(
      "/my/shifts/shift-1/edit?month=2026-03&returnTo=list",
    );
  });

  it("sends selected shift ids to bulk delete API", async () => {
    const user = userEvent.setup();
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
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "削除する" }));

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
  });
});
