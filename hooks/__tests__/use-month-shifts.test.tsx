import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useMonthShifts, type MonthShift } from "@/hooks/use-month-shifts";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createMockResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function createMonthShift(overrides?: Partial<MonthShift>): MonthShift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026-06-15T00:00:00.000Z",
    startTime: "2026-06-15T09:00:00.000Z",
    endTime: "2026-06-15T12:00:00.000Z",
    breakMinutes: 0,
    shiftType: "NORMAL",
    comment: null,
    googleSyncStatus: "SUCCESS",
    googleSyncError: null,
    googleSyncedAt: "2026-06-15T12:30:00.000Z",
    workedMinutes: 180,
    estimatedPay: 3600,
    workplace: {
      id: "workplace-1",
      name: "勤務先A",
      color: "#123456",
      type: "GENERAL",
    },
    lessonRange: null,
    ...overrides,
  };
}

describe("useMonthShifts", () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    console.error = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it("deferEstimate時も初期表示では推定済みSSRデータを再利用して再取得しない", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    const initialShifts = [createMonthShift()];

    const { result } = renderHook(
      () =>
        useMonthShifts(new Date("2026-06-01T00:00:00.000Z"), {
          cacheUserKey: "user-1",
          initialShifts,
          initialStartDate: "2026-06-01",
          initialEndDate: "2026-06-30",
          deferEstimate: true,
        }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.shifts).toEqual(initialShifts);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("後追い推定取得がAbortErrorで中断されてもコンソールエラーを出さない", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    const abortError = new DOMException("Aborted", "AbortError");

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("includeEstimate=true")) {
        return Promise.reject(abortError);
      }

      return Promise.resolve(
        createMockResponse({
          data: [createMonthShift({ estimatedPay: null })],
        }),
      );
    });

    const { result } = renderHook(
      () =>
        useMonthShifts(new Date("2026-07-01T00:00:00.000Z"), {
          cacheUserKey: "user-1",
          deferEstimate: true,
        }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.shifts).toHaveLength(1);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(console.error).not.toHaveBeenCalled();
  });
});
