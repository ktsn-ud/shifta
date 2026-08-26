import { type ReactElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkShiftForm } from "@/components/shifts/BulkShiftForm";
import type { MonthShift } from "@/hooks/use-month-shifts";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const refreshMock = jest.fn();
const BULK_CALENDAR_SELECTION_STORAGE_KEY = "shifta:bulk-calendar-selection:v1";
const LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY =
  "shifta:bulk-calendar-selection";
const WORKPLACE_LIST_URL = "/api/workplaces?includeCounts=false";
const SHIFT_FORM_BOOTSTRAP_URL = "/api/shifts/form-bootstrap";
const BULK_SHIFT_FORM_PROPS = {
  initialMonthInputValue: "2026-03",
  todayDateKey: "2026-03-15",
} as const;

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

function render(ui: ReactElement) {
  const queryClient = getBrowserQueryClient();
  queryClient.clear();
  queryClient.setDefaultOptions({
    queries: { retry: false },
    mutations: { retry: false },
  });

  return baseRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderBulkShiftForm() {
  return render(<BulkShiftForm {...BULK_SHIFT_FORM_PROPS} />);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createMonthShift(overrides: Partial<MonthShift> = {}): MonthShift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026-03-20T00:00:00.000Z",
    startTime: "1970-01-01T09:00:00.000Z",
    endTime: "1970-01-01T18:00:00.000Z",
    breakMinutes: 0,
    transportationAllowance: 0,
    shiftType: "NORMAL",
    comment: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 540,
    estimatedPay: null,
    workplace: {
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
    },
    lessonRange: null,
    ...overrides,
  };
}

function createShiftFormBootstrapResponse(): Response {
  return jsonResponse({
    data: {
      workplaces: [
        {
          id: "workplace-1",
          name: "勤務先A",
          type: "GENERAL",
          color: "#3366FF",
        },
      ],
      selectedWorkplace: {
        id: "workplace-1",
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
      payrollRules: [
        {
          id: "rule-1",
          workplaceId: "workplace-1",
          startDate: "2026-01-01",
          endDate: null,
          baseHourlyWage: 1200,
          holidayAllowanceHourly: 0,
          nightPremiumRate: 0.25,
          overtimePremiumRate: 0.25,
          dailyOvertimeThreshold: 8,
          holidayType: "NONE",
        },
      ],
      timetableSets: [],
    },
  });
}

function createCramSchoolShiftFormBootstrapResponse(): Response {
  return jsonResponse({
    data: {
      workplaces: [
        {
          id: "workplace-1",
          name: "英語塾A",
          type: "CRAM_SCHOOL",
          color: "#3366FF",
        },
      ],
      selectedWorkplace: {
        id: "workplace-1",
        name: "英語塾A",
        type: "CRAM_SCHOOL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
      payrollRules: [
        {
          id: "rule-1",
          workplaceId: "workplace-1",
          startDate: "2026-01-01",
          endDate: null,
          baseHourlyWage: 1200,
          holidayAllowanceHourly: 0,
          nightPremiumRate: 0.25,
          overtimePremiumRate: 0.25,
          dailyOvertimeThreshold: 8,
          holidayType: "NONE",
        },
      ],
      timetableSets: [
        {
          id: "set-1",
          workplaceId: "workplace-1",
          name: "通常授業",
          sortOrder: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          items: [
            {
              id: "timetable-1",
              timetableSetId: "set-1",
              period: 1,
              startTime: "1970-01-01T16:30:00.000Z",
              endTime: "1970-01-01T17:30:00.000Z",
            },
          ],
        },
      ],
    },
  });
}

function handleBulkPreviewFetch(input: string): Response | null {
  if (input.startsWith(SHIFT_FORM_BOOTSTRAP_URL)) {
    return createShiftFormBootstrapResponse();
  }

  const workplaceDetailMatch = input.match(/^\/api\/workplaces\/([^/]+)$/);
  if (workplaceDetailMatch) {
    return jsonResponse({
      data: {
        id: workplaceDetailMatch[1],
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    });
  }

  const payrollRulesMatch = input.match(
    /^\/api\/workplaces\/([^/]+)\/payroll-rules$/,
  );
  if (payrollRulesMatch) {
    return jsonResponse({
      data: [
        {
          workplaceId: payrollRulesMatch[1],
          startDate: "2026-01-01",
          endDate: null,
          baseHourlyWage: 1200,
          holidayAllowanceHourly: 0,
          nightPremiumRate: 0.25,
          overtimePremiumRate: 0.25,
          dailyOvertimeThreshold: 8,
          holidayType: "NONE",
        },
      ],
    });
  }

  if (input.startsWith("/api/payroll/preview-baseline?")) {
    const url = new URL(`http://localhost${input}`);
    const months = (url.searchParams.get("months") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return jsonResponse({
      data: {
        months: months.map((month) => ({
          month,
          totalWage: 0,
          totalTransportationAllowance: 0,
          totalAmount: 0,
          byWorkplace: [],
        })),
      },
    });
  }

  if (input.startsWith("/api/payroll/preview-annual?")) {
    return jsonResponse({
      data: {
        years: [
          {
            year: 2026,
            taxableAmount: 100000,
            nonTaxableAmount: 10000,
            totalAmount: 110000,
          },
        ],
        actualPayrollKeys: [],
      },
    });
  }

  return null;
}

function isCalendarEventsRequest(
  input: string,
  init?: { method?: string },
): boolean {
  return (
    input.startsWith("/api/calendar/events?month=") && init?.method === "POST"
  );
}

function mockBulkCalendarSelectionRequests(
  fetchMock: jest.Mock,
  calendarRequests: Array<{ url: string; method?: string }>,
): void {
  fetchMock.mockImplementation(
    async (input: string, init?: { method?: string }) => {
      if (isCalendarEventsRequest(input, init)) {
        calendarRequests.push({
          url: input,
          method: init?.method,
        });

        const requestUrl = new URL(input, "http://localhost");
        const requestedCalendarIds =
          requestUrl.searchParams.getAll("calendarId");
        const selectedCalendarIds =
          requestedCalendarIds.length > 0 ? requestedCalendarIds : ["cal-1"];

        return jsonResponse({
          data: {
            month: "2026-03",
            calendars: [
              {
                id: "cal-1",
                summary: "個人",
                color: "#3366FF",
              },
              {
                id: "cal-2",
                summary: "バイト",
                color: "#0EA5E9",
              },
            ],
            selectedCalendarIds,
            dates: [],
          },
        });
      }

      if (input === WORKPLACE_LIST_URL) {
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

      const previewResponse = handleBulkPreviewFetch(input);
      if (previewResponse) {
        return previewResponse;
      }

      throw new Error("Unexpected fetch: " + input);
    },
  );
}

function dateKeyFromDay(day: number): string {
  const year = 2026;
  const month = 3;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getBulkCalendarGrid(): HTMLElement {
  const calendarGrid = document.getElementById("bulk-calendar-grid");
  if (!calendarGrid) {
    throw new Error("Bulk calendar grid not found");
  }

  return calendarGrid;
}

function findEnabledDayButton(day: number): HTMLButtonElement {
  const calendarGrid = getBulkCalendarGrid();

  const buttons = within(calendarGrid).getAllByRole("button", {
    name: String(day),
  });
  const target = buttons.find((button) => !button.hasAttribute("disabled"));

  if (!target) {
    throw new Error(`Enabled day button not found: ${day}`);
  }

  return target as HTMLButtonElement;
}

describe("bulk shift flow integration", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-15T09:00:00.000Z"));
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    localStorage.clear();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads form reference data from the bootstrap endpoint", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      SHIFT_FORM_BOOTSTRAP_URL,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === WORKPLACE_LIST_URL),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        /^\/api\/workplaces\/[^/]+(?:\/payroll-rules|\/timetables)?$/.test(
          String(url),
        ),
      ),
    ).toBe(false);
  });

  it("shows the selected date count and disables applying defaults until a date is selected", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    const applyDefaultsButton = await screen.findByRole("button", {
      name: "選択中の0日分に適用",
    });
    expect(applyDefaultsButton).toBeDisabled();
    expect(
      screen.getByText("選択中の0日分へデフォルト値を反映します。"),
    ).toBeInTheDocument();

    await screen.findByRole("button", { name: "20" });
    await user.click(findEnabledDayButton(20));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "選択中の1日分に適用" }),
      ).toBeEnabled();
    });
    expect(
      screen.getByText("選択中の1日分へデフォルト値を反映します。"),
    ).toBeInTheDocument();
  });

  it("loads google calendar events with POST", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            String(url).startsWith("/api/calendar/events?month=") &&
            (options as { method?: string } | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("selects multiple days, edits each row, and posts bulk payload", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    expect(
      screen.getByText("イベント名プレビュー「勤務先A」"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("デフォルトコメント"), {
      target: { value: "研修" },
    });
    fireEvent.change(screen.getByLabelText("デフォルト交通費"), {
      target: { value: "480" },
    });
    expect(
      screen.getByText("イベント名プレビュー「勤務先A (研修)」"),
    ).toBeInTheDocument();

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
    fireEvent.change(within(secondRow).getByLabelText("コメント"), {
      target: { value: "棚卸" },
    });
    fireEvent.change(within(secondRow).getByLabelText("交通費"), {
      target: { value: "360" },
    });
    expect(
      within(secondRow).getByText("イベント名プレビュー「勤務先A (棚卸)」"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my?month=2026-03");
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
        comment: string;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        transportationAllowance: number;
      }>;
    };

    expect(body.workplaceId).toBe("workplace-1");
    expect(body.shifts).toEqual([
      {
        date: firstDateKey,
        shiftType: "NORMAL",
        comment: "研修",
        startTime: "10:00",
        endTime: "18:30",
        breakMinutes: 0,
        transportationAllowance: 480,
      },
      {
        date: secondDateKey,
        shiftType: "NORMAL",
        comment: "棚卸",
        startTime: "13:00",
        endTime: "20:00",
        breakMinutes: 0,
        transportationAllowance: 360,
      },
    ]);
  });

  it("updates month cache optimistically before redirecting after bulk submit", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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
              data: [
                createMonthShift({
                  id: "shift-1",
                  date: "2026-03-20T00:00:00.000Z",
                }),
                createMonthShift({
                  id: "shift-2",
                  date: "2026-03-21T00:00:00.000Z",
                  startTime: "1970-01-01T13:00:00.000Z",
                  endTime: "1970-01-01T20:00:00.000Z",
                  workedMinutes: 420,
                  comment: "棚卸",
                }),
              ],
              summary: {
                total: 2,
                synced: 0,
                failed: 0,
                pending: 2,
              },
              sync: {
                status: "success",
                pending: true,
              },
            },
            201,
          );
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    const queryClient = getBrowserQueryClient();
    const marchKey = queryKeys.shifts.month({
      userId: "user-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      includeEstimate: false,
    });
    queryClient.setQueryData<MonthShift[]>(marchKey, []);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));
    await user.click(findEnabledDayButton(21));
    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my?month=2026-03");
    });

    expect(
      (queryClient.getQueryData(marchKey) as MonthShift[]).map((shift) => ({
        id: shift.id,
        date: shift.date,
        comment: shift.comment,
      })),
    ).toEqual([
      {
        id: "shift-1",
        date: "2026-03-20T00:00:00.000Z",
        comment: null,
      },
      {
        id: "shift-2",
        date: "2026-03-21T00:00:00.000Z",
        comment: "棚卸",
      },
    ]);
  });

  it("shows overnight summary confirmation before bulk submit", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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
                synced: 1,
                failed: 0,
              },
            },
            201,
          );
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));

    const dateKey = dateKeyFromDay(20);
    const rowDeleteButton = screen.getByRole("button", {
      name: `${dateKey}の入力行を削除`,
    });
    const row = rowDeleteButton.closest("section");
    if (!row) {
      throw new Error("row section not found");
    }

    fireEvent.change(within(row).getByLabelText("開始時刻"), {
      target: { value: "18:00" },
    });
    fireEvent.change(within(row).getByLabelText("終了時刻"), {
      target: { value: "01:00" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(
      screen.getByRole("heading", {
        name: "翌日終了として登録されるシフトがあります",
      }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          url === "/api/shifts/bulk" &&
          (options as { method?: string } | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "まとめて翌日終了として登録" }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my?month=2026-03");
    });
  });

  it("redirects to calendar setup when bulk sync reports missing calendar", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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
              data: [createMonthShift()],
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

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    const queryClient = getBrowserQueryClient();
    const marchKey = queryKeys.shifts.month({
      userId: "user-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      includeEstimate: false,
    });
    queryClient.setQueryData<MonthShift[]>(marchKey, []);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));
    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(CALENDAR_SETUP_PATH);
    });

    expect(
      (queryClient.getQueryData(marchKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-1"]);
  });

  it("shows google events for selected day on bulk calendar", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [
                {
                  id: "cal-1",
                  summary: "個人",
                  color: "#3366FF",
                },
              ],
              selectedCalendarIds: ["cal-1"],
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

        if (input === WORKPLACE_LIST_URL) {
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

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

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

  it("renders holiday in red and saturday in blue on bulk calendar", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    const holidayButton = findEnabledDayButton(20);
    const saturdayButton = findEnabledDayButton(21);

    expect(within(holidayButton).getByText("20")).toHaveClass("text-red-600");
    expect(within(saturdayButton).getByText("21")).toHaveClass("text-blue-600");
  });

  it("prioritizes the current versioned calendar selection over a legacy value", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;
    const calendarRequests: Array<{ url: string; method?: string }> = [];

    localStorage.setItem(
      BULK_CALENDAR_SELECTION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        hasUserSelection: true,
        selectedCalendarIds: ["cal-2"],
      }),
    );
    localStorage.setItem(
      LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        hasUserSelection: true,
        selectedCalendarIds: ["cal-1"],
      }),
    );

    mockBulkCalendarSelectionRequests(fetchMock, calendarRequests);

    const { unmount } = renderBulkShiftForm();

    await waitFor(() => {
      expect(calendarRequests.length).toBeGreaterThan(0);
    });

    expect(calendarRequests[0]?.method).toBe("POST");

    const firstRequest = new URL(
      calendarRequests[0]?.url ?? "",
      "http://localhost",
    );
    expect(firstRequest.searchParams.getAll("calendarId")).toEqual(["cal-2"]);

    const resetButton = await screen.findByRole("button", {
      name: "デフォルトに戻す",
    });
    await user.click(resetButton);

    await waitFor(() => {
      expect(
        localStorage.getItem(BULK_CALENDAR_SELECTION_STORAGE_KEY),
      ).toBeNull();
      expect(
        localStorage.getItem(LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY),
      ).toBeNull();
    });

    const requestCountBeforeRemount = calendarRequests.length;
    unmount();
    renderBulkShiftForm();

    await waitFor(() => {
      expect(calendarRequests.length).toBeGreaterThan(
        requestCountBeforeRemount,
      );
    });

    const remountRequest = new URL(
      calendarRequests[requestCountBeforeRemount]?.url ?? "",
      "http://localhost",
    );
    expect(remountRequest.searchParams.getAll("calendarId")).toEqual([]);
  });

  it("migrates a valid legacy calendar selection to the versioned key", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    const calendarRequests: Array<{ url: string; method?: string }> = [];
    const legacyPayload = {
      version: 1,
      hasUserSelection: true,
      selectedCalendarIds: [" cal-2 ", "cal-2"],
    };

    localStorage.setItem(
      LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY,
      JSON.stringify(legacyPayload),
    );
    mockBulkCalendarSelectionRequests(fetchMock, calendarRequests);

    renderBulkShiftForm();

    await waitFor(() => {
      expect(calendarRequests.length).toBeGreaterThan(0);
    });

    const firstRequest = new URL(
      calendarRequests[0]?.url ?? "",
      "http://localhost",
    );
    expect(firstRequest.searchParams.getAll("calendarId")).toEqual(["cal-2"]);
    expect(
      JSON.parse(
        localStorage.getItem(BULK_CALENDAR_SELECTION_STORAGE_KEY) ?? "null",
      ),
    ).toEqual({
      version: 1,
      hasUserSelection: true,
      selectedCalendarIds: ["cal-2"],
    });
    expect(
      localStorage.getItem(LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY),
    ).toBeNull();
  });

  it("rejects an invalid legacy calendar selection without applying it", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    const calendarRequests: Array<{ url: string; method?: string }> = [];
    const invalidLegacyPayload = JSON.stringify({
      version: 2,
      hasUserSelection: true,
      selectedCalendarIds: ["cal-2"],
    });

    localStorage.setItem(
      LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY,
      invalidLegacyPayload,
    );
    mockBulkCalendarSelectionRequests(fetchMock, calendarRequests);

    renderBulkShiftForm();

    await waitFor(() => {
      expect(calendarRequests.length).toBeGreaterThan(0);
    });

    const firstRequest = new URL(calendarRequests[0].url, "http://localhost");
    expect(firstRequest.searchParams.getAll("calendarId")).toEqual([]);
    expect(
      localStorage.getItem(BULK_CALENDAR_SELECTION_STORAGE_KEY),
    ).toBeNull();
    expect(
      localStorage.getItem(LEGACY_BULK_CALENDAR_SELECTION_STORAGE_KEY),
    ).toBe(invalidLegacyPayload);
  });

  it("shows payroll preview after selecting a date row", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input === WORKPLACE_LIST_URL) {
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

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(findEnabledDayButton(20));

    await waitFor(() => {
      expect(screen.getAllByText("支給額プレビュー").length).toBeGreaterThan(0);
      const annualPreview =
        screen.getByText("年間支給額プレビュー").parentElement;
      if (!annualPreview) {
        throw new Error("年間支給額プレビューが見つかりません。");
      }

      expect(screen.getAllByText("登録後見込")).toHaveLength(2);
      expect(within(annualPreview).getByText("登録後見込")).toBeInTheDocument();
      expect(within(annualPreview).getByText("課税合計")).toBeInTheDocument();
      expect(within(annualPreview).getByText("総支給額")).toBeInTheDocument();
    });
  });

  it("keeps the previous calendar visible while the next month is refreshing", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    const requestedCalendarMonths: string[] = [];
    let resolveAprilResponse!: (value: Response) => void;
    const aprilResponse = new Promise<Response>((resolve) => {
      resolveAprilResponse = resolve;
    });

    fetchMock.mockImplementation(
      (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          const url = new URL(input, "http://localhost");
          const month = url.searchParams.get("month");
          requestedCalendarMonths.push(month ?? "");

          if (month === "2026-03") {
            return Promise.resolve(
              jsonResponse({
                data: {
                  month: "2026-03",
                  calendars: [],
                  selectedCalendarIds: [],
                  dates: [
                    {
                      date: "2026-03-20",
                      count: 1,
                      items: [
                        {
                          title: "March Event",
                          start: "09:00",
                          end: "10:00",
                          allDay: false,
                          calendarId: "cal-1",
                          calendarSummary: "Main",
                          calendarColor: "#3366FF",
                        },
                      ],
                    },
                  ],
                },
              }),
            );
          }

          if (month === "2026-04") {
            return aprilResponse;
          }
        }

        if (input === WORKPLACE_LIST_URL) {
          return Promise.resolve(
            jsonResponse({
              data: [
                {
                  id: "workplace-1",
                  name: "勤務先A",
                  color: "#3366FF",
                  type: "GENERAL",
                },
              ],
            }),
          );
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return Promise.resolve(previewResponse);
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        within(getBulkCalendarGrid()).getByText("09:00-10:00 March Event"),
      ).toBeInTheDocument();
    });

    await user.click(findEnabledDayButton(20));

    const dateKey = dateKeyFromDay(20);
    const rowDeleteButton = screen.getByRole("button", {
      name: `${dateKey}の入力行を削除`,
    });
    const row = rowDeleteButton.closest("section");
    if (!row) {
      throw new Error("row section not found");
    }

    fireEvent.change(within(row).getByLabelText("コメント"), {
      target: { value: "月移動後も保持" },
    });

    await user.click(screen.getByRole("button", { name: "次月" }));

    expect(requestedCalendarMonths).toContain("2026-04");
    expect(
      replaceMock.mock.calls.some(
        ([href]) =>
          typeof href === "string" && href.startsWith("/my/shifts/bulk"),
      ),
    ).toBe(false);

    expect(
      within(getBulkCalendarGrid()).getByText("09:00-10:00 March Event"),
    ).toBeInTheDocument();
    expect(screen.getByText("最新データを更新中...")).toBeInTheDocument();
    expect(screen.getByText("選択中: 1/31日")).toBeInTheDocument();
    expect(within(row).getByLabelText("コメント")).toHaveValue(
      "月移動後も保持",
    );

    resolveAprilResponse(
      jsonResponse({
        data: {
          month: "2026-04",
          calendars: [],
          selectedCalendarIds: [],
          dates: [
            {
              date: "2026-04-20",
              count: 1,
              items: [
                {
                  title: "April Event",
                  start: "11:00",
                  end: "12:00",
                  allDay: false,
                  calendarId: "cal-1",
                  calendarSummary: "Main",
                  calendarColor: "#3366FF",
                },
              ],
            },
          ],
        },
      }),
    );

    await waitFor(() => {
      expect(
        within(getBulkCalendarGrid()).getByText("11:00-12:00 April Event"),
      ).toBeInTheDocument();
    });
    expect(
      within(getBulkCalendarGrid()).queryByText("09:00-10:00 March Event"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("選択中: 1/31日")).toBeInTheDocument();
    expect(within(row).getByLabelText("コメント")).toHaveValue(
      "月移動後も保持",
    );
  });

  it("returns to the requested month when cancelling after moving to the next month", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;
    const requestedCalendarMonths: string[] = [];

    fetchMock.mockImplementation(
      (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          const month = new URL(input, "http://localhost").searchParams.get(
            "month",
          );
          requestedCalendarMonths.push(month ?? "");

          return Promise.resolve(
            jsonResponse({
              data: {
                month: month ?? "2026-03",
                calendars: [],
                selectedCalendarIds: [],
                dates: [],
              },
            }),
          );
        }

        if (input.startsWith(SHIFT_FORM_BOOTSTRAP_URL)) {
          return Promise.resolve(createShiftFormBootstrapResponse());
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("勤務先A");
    });

    await user.click(screen.getByRole("button", { name: "次月" }));

    await waitFor(() => {
      expect(requestedCalendarMonths).toContain("2026-04");
    });

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(pushMock).toHaveBeenCalledWith("/my?month=2026-04");
  });

  it("summarizes invalid rows and focuses the first invalid field", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (isCalendarEventsRequest(input, init)) {
          return jsonResponse({
            data: {
              month: "2026-03",
              calendars: [],
              selectedCalendarIds: [],
              dates: [],
            },
          });
        }

        if (input.startsWith(SHIFT_FORM_BOOTSTRAP_URL)) {
          return createCramSchoolShiftFormBootstrapResponse();
        }

        const previewResponse = handleBulkPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    renderBulkShiftForm();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "勤務先" }),
      ).toHaveTextContent("英語塾A");
    });

    await user.click(findEnabledDayButton(20));
    await user.click(findEnabledDayButton(21));

    const firstDateKey = dateKeyFromDay(20);
    const secondDateKey = dateKeyFromDay(21);
    const lessonRadio = document.getElementById(`${firstDateKey}-shift-lesson`);
    if (!lessonRadio) {
      throw new Error("LESSON radio input not found");
    }
    fireEvent.click(lessonRadio);

    await waitFor(() => {
      expect(
        document.getElementById(`${firstDateKey}-timetable-set`),
      ).toBeInTheDocument();
    });
    expect(
      document.getElementById(`${firstDateKey}-start-period`),
    ).toBeInTheDocument();
    expect(
      document.getElementById(`${firstDateKey}-end-period`),
    ).toBeInTheDocument();

    const firstNormalRadio = document.getElementById(
      `${firstDateKey}-shift-normal`,
    );
    if (!firstNormalRadio) {
      throw new Error("first NORMAL radio input not found");
    }
    fireEvent.click(firstNormalRadio);

    const firstEnd = document.getElementById(`${firstDateKey}-end-time`);
    if (!(firstEnd instanceof HTMLInputElement)) {
      throw new Error("first row end time input not found");
    }
    const scrollIntoView = jest.fn();
    firstEnd.scrollIntoView = scrollIntoView;
    fireEvent.change(firstEnd, { target: { value: "09:00" } });

    const secondNormalRadio = document.getElementById(
      `${secondDateKey}-shift-normal`,
    );
    if (!secondNormalRadio) {
      throw new Error("second NORMAL radio input not found");
    }
    fireEvent.click(secondNormalRadio);

    const secondEnd = document.getElementById(`${secondDateKey}-end-time`);
    if (!(secondEnd instanceof HTMLInputElement)) {
      throw new Error("second row end time input not found");
    }
    fireEvent.change(secondEnd, { target: { value: "09:00" } });

    await user.click(screen.getByRole("button", { name: "確定" }));
    await jest.advanceTimersByTimeAsync(0);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "2件の入力エラーがあります" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(`修正が必要な日付: ${firstDateKey}、${secondDateKey}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "最初の修正対象: 2026年3月20日(金)の終了時刻: 開始時刻と終了時刻は同じ時刻にできません。",
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
      expect(document.activeElement).toBe(firstEnd);
    });
    fireEvent.change(firstEnd, { target: { value: "18:00" } });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "1件の入力エラーがあります" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(`修正が必要な日付: ${secondDateKey}`),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "確定" }));
    await jest.advanceTimersByTimeAsync(0);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "1件の入力エラーがあります" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(`修正が必要な日付: ${secondDateKey}`),
    ).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          url === "/api/shifts/bulk" &&
          (options as { method?: string } | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });
});
