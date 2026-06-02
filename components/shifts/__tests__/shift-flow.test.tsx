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
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { ShiftForm } from "@/components/shifts/ShiftForm";
import type { MonthShift } from "@/hooks/use-month-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";

const pushMock = jest.fn();
const WORKPLACE_LIST_URL = "/api/workplaces?includeCounts=false";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/my",
}));

function render(ui: ReactElement) {
  const queryClient = getBrowserQueryClient();
  queryClient.clear();

  return {
    queryClient,
    ...baseRender(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function handleShiftPreviewFetch(input: string): Response | null {
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
          byWorkplace: [],
        })),
      },
    });
  }

  return null;
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function createMonthShift(overrides: Partial<MonthShift> = {}): MonthShift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026-03-18T00:00:00.000Z",
    startTime: "1970-01-01T09:00:00.000Z",
    endTime: "1970-01-01T17:00:00.000Z",
    breakMinutes: 60,
    shiftType: "NORMAL",
    comment: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 420,
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

describe("shift flow integration", () => {
  beforeEach(() => {
    pushMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  it("creates a NORMAL shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse({ data: { id: "shift-1" } }, 201);
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });
    expect(
      screen.getByText("イベント名プレビュー「勤務先A」"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("コメント"), {
      target: { value: "研修" },
    });
    expect(
      screen.getByText("イベント名プレビュー「勤務先A (研修)」"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts" &&
        (options as { method?: string } | undefined)?.method === "POST",
    );

    expect(postCall).toBeTruthy();

    const body = JSON.parse(
      ((postCall?.[1] as { body?: string } | undefined)?.body ??
        "{}") as string,
    ) as {
      workplaceId: string;
      date: string;
      shiftType: string;
      comment: string;
      startTime: string;
      endTime: string;
    };

    expect(body).toMatchObject({
      workplaceId: "workplace-1",
      date: "2026-03-18",
      shiftType: "NORMAL",
      comment: "研修",
      startTime: "09:00",
      endTime: "17:00",
    });
  });

  it("adds the created shift to the loaded month cache before navigating", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse(
            {
              data: {
                id: "shift-1",
                workplaceId: "workplace-1",
                date: "2026-03-18T00:00:00.000Z",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
                breakMinutes: 60,
                shiftType: "NORMAL",
                comment: null,
                workplace: {
                  id: "workplace-1",
                  name: "勤務先A",
                  color: "#3366FF",
                  type: "GENERAL",
                },
                lessonRange: null,
              },
              sync: { pending: true, ok: true },
            },
            201,
          );
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    const { queryClient } = render(
      <ShiftForm
        mode="create"
        initialDate="2026-03-18"
        returnMonth="2026-03"
      />,
    );
    const monthKey = queryKeys.shifts.month({
      userId: "self",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      includeEstimate: false,
    });

    queryClient.setQueryData<MonthShift[]>(monthKey, []);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });

    await user.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(monthKey)).toEqual([createMonthShift()]);
    });
    expect(pushMock).toHaveBeenCalledWith("/my?month=2026-03");
  });

  it("shows overnight confirmation before creating NORMAL shift", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse({ data: { id: "shift-overnight-1" } }, 201);
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "01:00" },
    });

    await user.click(screen.getByRole("button", { name: "登録" }));

    expect(
      screen.getByRole("heading", { name: "このシフトは日付をまたぎます" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          url === "/api/shifts" &&
          (options as { method?: string } | undefined)?.method === "POST",
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "翌日終了として保存" }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });
  });

  it("returns to requested dashboard month after creating a shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse({ data: { id: "shift-1" } }, 201);
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(
      <ShiftForm
        mode="create"
        initialDate="2026-03-18"
        returnMonth="2026-01"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my?month=2026-01");
    });
  });

  it("shows validation error when start and end time are the same in create mode", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
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

      const previewResponse = handleShiftPreviewFetch(input);
      if (previewResponse) {
        return previewResponse;
      }

      throw new Error("Unexpected fetch: " + input);
    });

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await user.click(screen.getByRole("button", { name: "登録" }));

    expect(
      screen.getByText("ERR_002: 開始時刻と終了時刻は同じ時刻にできません"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("redirects to calendar setup when sync detects missing calendar", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse(
            {
              data: { id: "shift-1" },
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

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });
  });

  it("edits an existing shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/shift-1" &&
        (options as { method?: string } | undefined)?.method === "PUT",
    );

    expect(putCall).toBeTruthy();

    const body = JSON.parse(
      ((putCall?.[1] as { body?: string } | undefined)?.body ?? "{}") as string,
    ) as {
      shiftType: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
    };

    expect(body).toMatchObject({
      shiftType: "NORMAL",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 45,
    });
  });

  it("shows overnight confirmation when editing from same-day to overnight", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "01:00" },
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    expect(
      screen.getByRole("heading", { name: "このシフトは日付をまたぎます" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          url === "/api/shifts/shift-1" &&
          (options as { method?: string } | undefined)?.method === "PUT",
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "翌日終了として保存" }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });
  });

  it("does not show overnight confirmation when editing comment only on existing overnight shift", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T18:00:00.000Z",
              endTime: "1970-01-01T01:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T18:00:00.000Z",
                endTime: "1970-01-01T01:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("18:00");
    });

    fireEvent.change(screen.getByLabelText("コメント"), {
      target: { value: "コメント更新" },
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    expect(
      screen.queryByRole("heading", { name: "このシフトは日付をまたぎます" }),
    ).not.toBeInTheDocument();
  });

  it("returns to requested dashboard month after editing a shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-1" returnMonth="2026-01" />);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my?month=2026-01");
    });
  });

  it("moves the edited shift from the old month cache to the new month cache", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-04-02T00:00:00.000Z",
              startTime: "1970-01-01T10:00:00.000Z",
              endTime: "1970-01-01T18:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              workplace: {
                id: "workplace-1",
                name: "勤務先A",
                color: "#3366FF",
                type: "GENERAL",
              },
              lessonRange: null,
            },
            sync: { pending: true, ok: true },
          });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    const { queryClient } = render(
      <ShiftForm mode="edit" shiftId="shift-1" returnMonth="2026-04" />,
    );
    const marchKey = queryKeys.shifts.month({
      userId: "self",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      includeEstimate: false,
    });
    const aprilKey = queryKeys.shifts.month({
      userId: "self",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      includeEstimate: false,
    });

    queryClient.setQueryData<MonthShift[]>(marchKey, [createMonthShift()]);
    queryClient.setQueryData<MonthShift[]>(aprilKey, []);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("日付"), {
      target: { value: "2026-04-02" },
    });
    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(marchKey)).toEqual([]);
      expect(queryClient.getQueryData(aprilKey)).toEqual([
        createMonthShift({
          date: "2026-04-02T00:00:00.000Z",
          startTime: "1970-01-01T10:00:00.000Z",
          endTime: "1970-01-01T18:00:00.000Z",
          breakMinutes: 45,
          workedMinutes: 435,
        }),
      ]);
    });
    expect(pushMock).toHaveBeenCalledWith("/my?month=2026-04");
  });

  it("returns to shift list month when returnTo is list", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
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

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              comment: null,
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(
      <ShiftForm
        mode="edit"
        shiftId="shift-1"
        returnMonth="2026-01"
        returnTo="list"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my/shifts/list?month=2026-01");
    });
  });

  it("keeps LESSON prefilled values on edit even if workplaces load later", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const workplacesDeferred = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === WORKPLACE_LIST_URL) {
          return workplacesDeferred.promise;
        }

        if (input === "/api/shifts/shift-lesson-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-lesson-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T16:30:00.000Z",
              endTime: "1970-01-01T18:40:00.000Z",
              breakMinutes: 0,
              shiftType: "LESSON",
              comment: null,
              lessonRange: {
                timetableSetId: "set-normal",
                startPeriod: 1,
                endPeriod: 2,
              },
            },
          });
        }

        if (input === "/api/workplaces/workplace-1/timetables") {
          return jsonResponse({
            data: [
              {
                id: "set-normal",
                workplaceId: "workplace-1",
                name: "通常授業",
                sortOrder: 0,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                items: [
                  {
                    id: "tt-1",
                    timetableSetId: "set-normal",
                    period: 1,
                    startTime: "1970-01-01T16:30:00.000Z",
                    endTime: "1970-01-01T17:30:00.000Z",
                  },
                  {
                    id: "tt-2",
                    timetableSetId: "set-normal",
                    period: 2,
                    startTime: "1970-01-01T17:40:00.000Z",
                    endTime: "1970-01-01T18:40:00.000Z",
                  },
                ],
              },
            ],
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-lesson-1",
                startTime: "1970-01-01T16:30:00.000Z",
                endTime: "1970-01-01T18:40:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-lesson-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-lesson-1" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-lesson-1" />);

    workplacesDeferred.resolve(
      jsonResponse({
        data: [
          {
            id: "workplace-1",
            name: "英語塾A",
            color: "#3366FF",
            type: "CRAM_SCHOOL",
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
    });

    expect(screen.queryByLabelText("開始時刻")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/shift-lesson-1" &&
        (options as { method?: string } | undefined)?.method === "PUT",
    );

    expect(putCall).toBeTruthy();

    const body = JSON.parse(
      ((putCall?.[1] as { body?: string } | undefined)?.body ?? "{}") as string,
    ) as {
      shiftType: string;
      lessonRange?: {
        timetableSetId: string;
        startPeriod: number;
        endPeriod: number;
      };
    };

    expect(body).toMatchObject({
      shiftType: "LESSON",
      lessonRange: {
        timetableSetId: "set-normal",
        startPeriod: 1,
        endPeriod: 2,
      },
    });
  });

  it("keeps LESSON type and period defaults for delayed CRAM data on edit", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const workplacesDeferred = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === WORKPLACE_LIST_URL) {
          return workplacesDeferred.promise;
        }

        if (input === "/api/shifts/shift-lesson-2" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-lesson-2",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T13:00:00.000Z",
              endTime: "1970-01-01T14:10:00.000Z",
              breakMinutes: 0,
              shiftType: "LESSON",
              comment: null,
              lessonRange: {
                timetableSetId: "set-intensive",
                startPeriod: 2,
                endPeriod: 2,
              },
            },
          });
        }

        if (input === "/api/workplaces/workplace-1/timetables") {
          return jsonResponse({
            data: [
              {
                id: "set-normal",
                workplaceId: "workplace-1",
                name: "通常授業",
                sortOrder: 0,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                items: [
                  {
                    id: "tt-normal-1",
                    timetableSetId: "set-normal",
                    period: 1,
                    startTime: "1970-01-01T10:00:00.000Z",
                    endTime: "1970-01-01T11:00:00.000Z",
                  },
                  {
                    id: "tt-normal-2",
                    timetableSetId: "set-normal",
                    period: 2,
                    startTime: "1970-01-01T11:10:00.000Z",
                    endTime: "1970-01-01T12:10:00.000Z",
                  },
                ],
              },
              {
                id: "set-intensive",
                workplaceId: "workplace-1",
                name: "講習授業",
                sortOrder: 1,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                items: [
                  {
                    id: "tt-intensive-1",
                    timetableSetId: "set-intensive",
                    period: 1,
                    startTime: "1970-01-01T12:00:00.000Z",
                    endTime: "1970-01-01T12:50:00.000Z",
                  },
                  {
                    id: "tt-intensive-2",
                    timetableSetId: "set-intensive",
                    period: 2,
                    startTime: "1970-01-01T13:00:00.000Z",
                    endTime: "1970-01-01T14:10:00.000Z",
                  },
                  {
                    id: "tt-intensive-3",
                    timetableSetId: "set-intensive",
                    period: 3,
                    startTime: "1970-01-01T14:20:00.000Z",
                    endTime: "1970-01-01T15:20:00.000Z",
                  },
                ],
              },
            ],
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-lesson-2",
                startTime: "1970-01-01T13:00:00.000Z",
                endTime: "1970-01-01T14:10:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-lesson-2" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-lesson-2" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-lesson-2" />);

    workplacesDeferred.resolve(
      jsonResponse({
        data: [
          {
            id: "workplace-1",
            name: "英語塾A",
            color: "#3366FF",
            type: "CRAM_SCHOOL",
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/shift-lesson-2" &&
        (options as { method?: string } | undefined)?.method === "PUT",
    );

    expect(putCall).toBeTruthy();

    const body = JSON.parse(
      ((putCall?.[1] as { body?: string } | undefined)?.body ?? "{}") as string,
    ) as {
      shiftType: string;
      lessonRange?: {
        timetableSetId: string;
        startPeriod: number;
        endPeriod: number;
      };
    };

    expect(body).toMatchObject({
      shiftType: "LESSON",
      lessonRange: {
        timetableSetId: "set-intensive",
        startPeriod: 2,
        endPeriod: 2,
      },
    });
  });

  it("keeps intensive-only periods on edit before lesson type inference finishes", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    const workplacesDeferred = createDeferred<Response>();

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === WORKPLACE_LIST_URL) {
          return workplacesDeferred.promise;
        }

        if (input === "/api/shifts/shift-lesson-3" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-lesson-3",
              workplaceId: "workplace-1",
              date: "2026-03-19T00:00:00.000Z",
              startTime: "1970-01-01T15:30:00.000Z",
              endTime: "1970-01-01T16:20:00.000Z",
              breakMinutes: 0,
              shiftType: "LESSON",
              comment: null,
              lessonRange: {
                timetableSetId: "set-intensive",
                startPeriod: 5,
                endPeriod: 5,
              },
            },
          });
        }

        if (input === "/api/workplaces/workplace-1/timetables") {
          return jsonResponse({
            data: [
              {
                id: "set-normal",
                workplaceId: "workplace-1",
                name: "通常授業",
                sortOrder: 0,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                items: [
                  {
                    id: "tt-normal-1",
                    timetableSetId: "set-normal",
                    period: 1,
                    startTime: "1970-01-01T10:00:00.000Z",
                    endTime: "1970-01-01T11:00:00.000Z",
                  },
                  {
                    id: "tt-normal-2",
                    timetableSetId: "set-normal",
                    period: 2,
                    startTime: "1970-01-01T11:10:00.000Z",
                    endTime: "1970-01-01T12:10:00.000Z",
                  },
                  {
                    id: "tt-normal-3",
                    timetableSetId: "set-normal",
                    period: 3,
                    startTime: "1970-01-01T12:20:00.000Z",
                    endTime: "1970-01-01T13:20:00.000Z",
                  },
                ],
              },
              {
                id: "set-intensive",
                workplaceId: "workplace-1",
                name: "講習授業",
                sortOrder: 1,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                items: [
                  {
                    id: "tt-intensive-4",
                    timetableSetId: "set-intensive",
                    period: 4,
                    startTime: "1970-01-01T14:30:00.000Z",
                    endTime: "1970-01-01T15:20:00.000Z",
                  },
                  {
                    id: "tt-intensive-5",
                    timetableSetId: "set-intensive",
                    period: 5,
                    startTime: "1970-01-01T15:30:00.000Z",
                    endTime: "1970-01-01T16:20:00.000Z",
                  },
                ],
              },
            ],
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-lesson-3",
                startTime: "1970-01-01T15:30:00.000Z",
                endTime: "1970-01-01T16:20:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-lesson-3" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-lesson-3" } });
        }

        const previewResponse = handleShiftPreviewFetch(input);
        if (previewResponse) {
          return previewResponse;
        }

        throw new Error("Unexpected fetch: " + input);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-lesson-3" />);

    workplacesDeferred.resolve(
      jsonResponse({
        data: [
          {
            id: "workplace-1",
            name: "英語塾A",
            color: "#3366FF",
            type: "CRAM_SCHOOL",
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my");
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/shift-lesson-3" &&
        (options as { method?: string } | undefined)?.method === "PUT",
    );

    expect(putCall).toBeTruthy();

    const body = JSON.parse(
      ((putCall?.[1] as { body?: string } | undefined)?.body ?? "{}") as string,
    ) as {
      shiftType: string;
      lessonRange?: {
        timetableSetId: string;
        startPeriod: number;
        endPeriod: number;
      };
    };

    expect(body).toMatchObject({
      shiftType: "LESSON",
      lessonRange: {
        timetableSetId: "set-intensive",
        startPeriod: 5,
        endPeriod: 5,
      },
    });
  });

  it("deletes a shift from shift list modal", async () => {
    const onDeleteShift = jest.fn(async () => undefined);

    render(
      <ShiftListModal
        open
        onOpenChange={jest.fn()}
        targetDate={new Date("2026-03-18T00:00:00.000Z")}
        shifts={[
          {
            id: "shift-1",
            startTime: "1970-01-01T09:00:00.000Z",
            endTime: "1970-01-01T17:00:00.000Z",
            shiftType: "NORMAL",
            comment: null,
            estimatedPay: 8000,
            googleSyncStatus: "SUCCESS",
            googleSyncError: null,
            workplace: {
              id: "workplace-1",
              name: "勤務先A",
              color: "#3366FF",
            },
          },
        ]}
        onCreateShift={jest.fn()}
        onEditShift={jest.fn()}
        onDeleteShift={onDeleteShift}
        onRetrySync={jest.fn()}
      />,
    );

    const openDeleteButton = screen.getByRole("button", { name: "削除" });
    await userEvent.click(openDeleteButton);

    const dialog = await screen.findByRole("dialog");
    const confirmDeleteButton = within(dialog).getByRole("button", {
      name: "削除",
    });

    await userEvent.click(confirmDeleteButton);

    await waitFor(() => {
      expect(onDeleteShift).toHaveBeenCalledWith("shift-1");
    });
  });

  it("shows payroll preview when create form becomes calculable", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string) => {
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

      if (input.startsWith("/api/shifts?")) {
        return jsonResponse({ data: [] });
      }

      const previewResponse = handleShiftPreviewFetch(input);
      if (previewResponse) {
        return previewResponse;
      }

      throw new Error("Unexpected fetch: " + input);
    });

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });

    await waitFor(() => {
      expect(screen.getAllByText("支給額プレビュー").length).toBeGreaterThan(0);
      expect(screen.getByText("登録後見込")).toBeInTheDocument();
    });
  });
});
