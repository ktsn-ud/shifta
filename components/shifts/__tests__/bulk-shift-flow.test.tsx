import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkShiftForm } from "@/components/shifts/BulkShiftForm";

const pushMock = jest.fn();
const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function dateKeyFromDay(day: number): string {
  const year = 2026;
  const month = 3;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findEnabledDayButton(day: number): HTMLButtonElement {
  const buttons = screen.getAllByRole("button", { name: String(day) });
  const target = buttons.find((button) => {
    return button.hasAttribute("disabled") === false;
  });

  if (!target) {
    throw new Error(`Enabled day button not found: ${day}`);
  }

  return target as HTMLButtonElement;
}

describe("bulk shift flow integration", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-15T09:00:00.000Z"));
    pushMock.mockReset();
    refreshMock.mockReset();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("selects multiple days, edits each row, and posts bulk payload", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input.startsWith("/api/calendar/events?month=")) {
          return jsonResponse({
            data: {
              month: "2026-03",
              dates: [],
            },
          });
        }

        if (input === "/api/workplaces") {
          return jsonResponse({
            data: [
              {
                id: "workplace-1",
                name: "勤務先A",
                color: "#3366FF",
                type: "GENERAL",
              },
            ],
          });
        }

        if (input === "/api/shifts/bulk" && init?.method === "POST") {
          return jsonResponse(
            {
              data: [],
              summary: {
                total: 2,
                synced: 2,
                failed: 0,
              },
            },
            201,
          );
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    render(<BulkShiftForm />);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));
    await user.click(findEnabledDayButton(21));

    const firstDateKey = dateKeyFromDay(20);
    const secondDateKey = dateKeyFromDay(21);

    const firstRowDeleteButton = screen.getByRole("button", {
      name: `${firstDateKey}の入力行を削除`,
    });
    const firstRow = firstRowDeleteButton.closest("section");
    if (!firstRow) {
      throw new Error("first row section not found");
    }

    fireEvent.change(within(firstRow).getByLabelText("開始時刻"), {
      target: { value: "10:00" },
    });
    fireEvent.change(within(firstRow).getByLabelText("終了時刻"), {
      target: { value: "18:30" },
    });

    const secondRowDeleteButton = screen.getByRole("button", {
      name: `${secondDateKey}の入力行を削除`,
    });
    const secondRow = secondRowDeleteButton.closest("section");
    if (!secondRow) {
      throw new Error("second row section not found");
    }

    fireEvent.change(within(secondRow).getByLabelText("開始時刻"), {
      target: { value: "13:00" },
    });
    fireEvent.change(within(secondRow).getByLabelText("終了時刻"), {
      target: { value: "20:00" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/bulk" &&
        (options as { method?: string } | undefined)?.method === "POST",
    );

    expect(postCall).toBeTruthy();

    const body = JSON.parse(
      ((postCall?.[1] as { body?: string } | undefined)?.body ??
        "{}") as string,
    ) as {
      workplaceId: string;
      shifts: Array<{
        date: string;
        shiftType: string;
        startTime: string;
        endTime: string;
        breakMinutes: number;
      }>;
    };

    expect(body.workplaceId).toBe("workplace-1");
    expect(body.shifts).toEqual([
      {
        date: firstDateKey,
        shiftType: "NORMAL",
        startTime: "10:00",
        endTime: "18:30",
        breakMinutes: 0,
      },
      {
        date: secondDateKey,
        shiftType: "NORMAL",
        startTime: "13:00",
        endTime: "20:00",
        breakMinutes: 0,
      },
    ]);
  });

  it("redirects to calendar setup when bulk sync reports missing calendar", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input.startsWith("/api/calendar/events?month=")) {
          return jsonResponse({
            data: {
              month: "2026-03",
              dates: [],
            },
          });
        }

        if (input === "/api/workplaces") {
          return jsonResponse({
            data: [
              {
                id: "workplace-1",
                name: "勤務先A",
                color: "#3366FF",
                type: "GENERAL",
              },
            ],
          });
        }

        if (input === "/api/shifts/bulk" && init?.method === "POST") {
          return jsonResponse(
            {
              data: [],
              summary: {
                total: 1,
                synced: 0,
                failed: 1,
              },
              sync: {
                ok: false,
                errorMessage:
                  "同期先のGoogle Calendarが見つかりません。カレンダーを再設定してください",
                errorCode: "CALENDAR_NOT_FOUND",
                requiresCalendarSetup: true,
              },
            },
            201,
          );
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    render(<BulkShiftForm />);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));
    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my/calendar-setup");
    });
  });

  it("shows google events for selected day on bulk calendar", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith("/api/calendar/events?month=")) {
        return jsonResponse({
          data: {
            month: "2026-03",
            dates: [
              {
                date: "2026-03-20",
                count: 1,
                items: [
                  {
                    title: "研究室MTG",
                    start: "10:00",
                    end: "11:00",
                    allDay: false,
                    calendarId: "cal-1",
                    calendarSummary: "個人",
                    calendarColor: "#3366FF",
                  },
                ],
              },
            ],
          },
        });
      }

      if (input === "/api/workplaces") {
        return jsonResponse({
          data: [
            {
              id: "workplace-1",
              name: "勤務先A",
              color: "#3366FF",
              type: "GENERAL",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    render(<BulkShiftForm />);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));

    let eventLabels: HTMLElement[] = [];
    await waitFor(() => {
      eventLabels = screen.getAllByText("10:00-11:00 研究室MTG");
      expect(eventLabels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Google予定")).toBeInTheDocument();
    });

    const eventRow = eventLabels[0]?.closest("li");
    if (!eventRow) {
      throw new Error("event row not found");
    }

    const colorDot = eventRow.querySelector("span");
    if (!colorDot) {
      throw new Error("event color dot not found");
    }
    expect(colorDot).toHaveStyle({ backgroundColor: "#3366FF" });
  });
});
