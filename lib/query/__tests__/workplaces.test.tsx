import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useWorkplaceShiftFormBootstrapQuery,
  type WorkplaceShiftFormBootstrapData,
} from "@/lib/query/queries/workplaces";

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

function createBootstrapPayload(
  workplaceId = "workplace-1",
): WorkplaceShiftFormBootstrapData {
  return {
    workplaces: [
      {
        id: workplaceId,
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
      },
    ],
    selectedWorkplace: {
      id: workplaceId,
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
        workplaceId,
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
  };
}

function createMockResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => ({ data: payload }),
  } as Response;
}

describe("useWorkplaceShiftFormBootstrapQuery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("勤務先一覧・給与ルール・時間割を bootstrap endpoint 1本で取得する", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(createMockResponse(createBootstrapPayload()));

    const { result } = renderHook(
      () =>
        useWorkplaceShiftFormBootstrapQuery({
          userId: "self",
        }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.selectedWorkplace?.id).toBe("workplace-1");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/form-bootstrap",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/workplaces"),
      ),
    ).toBe(false);
  });

  it("selectedWorkplaceId を query parameter に載せて再取得する", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse(createBootstrapPayload("workplace-2")),
    );

    const { result } = renderHook(
      () =>
        useWorkplaceShiftFormBootstrapQuery({
          userId: "self",
          selectedWorkplaceId: "workplace-2",
        }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.selectedWorkplace?.id).toBe("workplace-2");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/form-bootstrap?selectedWorkplaceId=workplace-2",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
