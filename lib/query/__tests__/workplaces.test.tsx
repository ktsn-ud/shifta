import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useWorkplaceDetailQuery,
  useWorkplacePayrollRuleDetailQuery,
  useWorkplaceShiftFormBootstrapQuery,
  useWorkplaceTimetablesQuery,
  type WorkplaceShiftFormBootstrapData,
} from "@/lib/query/queries/workplaces";
import { queryKeys } from "@/lib/query/query-keys";

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

function createPayrollRuleDetailPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "rule-1",
    workplaceId: "workplace-1",
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: null,
    baseHourlyWage: "1200",
    holidayAllowanceHourly: null,
    nightPremiumRate: "0.25",
    overtimePremiumRate: "0.5",
    dailyOvertimeThreshold: "8",
    holidayType: "WEEKEND",
    ...overrides,
  };
}

function createWorkplaceDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "workplace-1",
    name: "勤務先A",
    type: "GENERAL",
    color: "#3366FF",
    ...overrides,
  };
}

function createTimetableSetPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "timetable-set-1",
    workplaceId: "workplace-1",
    name: "通常時間割",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: [
      {
        id: "timetable-item-1",
        timetableSetId: "timetable-set-1",
        period: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
    ...overrides,
  };
}

describe("useWorkplaceDetailQuery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("必須フィールドが欠落したDTOを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse(createWorkplaceDetailPayload({ color: undefined })),
    );

    const { result } = renderHook(
      () => useWorkplaceDetailQuery({ workplaceId: "workplace-1" }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
      });
    });
  });

  it("不正な型のDTOを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse(createWorkplaceDetailPayload({ name: 123 })),
    );

    const { result } = renderHook(
      () => useWorkplaceDetailQuery({ workplaceId: "workplace-1" }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
      });
    });
  });
});

describe("useWorkplaceTimetablesQuery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("itemsが欠落した時間割DTOを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    const timetableSet = createTimetableSetPayload();
    Reflect.deleteProperty(timetableSet, "items");
    fetchMock.mockResolvedValue(createMockResponse([timetableSet]));

    const { result } = renderHook(
      () => useWorkplaceTimetablesQuery({ workplaceId: "workplace-1" }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
      });
    });
  });

  it("不正な入れ子itemを含む時間割DTOを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse([
        createTimetableSetPayload({
          items: [
            {
              id: "timetable-item-1",
              timetableSetId: "timetable-set-1",
              period: 1,
              startTime: 900,
              endTime: "10:00",
            },
          ],
        }),
      ]),
    );

    const { result } = renderHook(
      () => useWorkplaceTimetablesQuery({ workplaceId: "workplace-1" }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
      });
    });
  });

  it("0以下のperiodを含む時間割DTOを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse([
        createTimetableSetPayload({
          items: [
            {
              id: "timetable-item-1",
              timetableSetId: "timetable-set-1",
              period: 0,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
        }),
      ]),
    );

    const { result } = renderHook(
      () => useWorkplaceTimetablesQuery({ workplaceId: "workplace-1" }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
      });
    });
  });
});

describe("useWorkplacePayrollRuleDetailQuery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("休日手当が未設定の詳細DTOを、勤務先・ルール単位のキーと指定キャッシュ方針で取得する", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse(createPayrollRuleDetailPayload()),
    );

    const { result } = renderHook(
      () =>
        useWorkplacePayrollRuleDetailQuery({
          workplaceId: "workplace-1",
          ruleId: "rule-1",
          requestCache: "no-store",
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.data?.holidayAllowanceHourly).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workplaces/workplace-1/payroll-rules/rule-1",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      queryClient.getQueryData(
        queryKeys.workplaces.payrollRuleDetail({
          workplaceId: "workplace-1",
          ruleId: "rule-1",
        }),
      ),
    ).toMatchObject({
      id: "rule-1",
      holidayAllowanceHourly: null,
    });
  });

  it("無効時は給与ルール詳細を取得しない", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;

    const { result } = renderHook(
      () =>
        useWorkplacePayrollRuleDetailQuery({
          workplaceId: "workplace-1",
          ruleId: "rule-1",
          enabled: false,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("不正な給与ルール詳細payloadを取得エラーとして扱う", async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse(
        createPayrollRuleDetailPayload({ holidayAllowanceHourly: false }),
      ),
    );

    const { result } = renderHook(
      () =>
        useWorkplacePayrollRuleDetailQuery({
          workplaceId: "workplace-1",
          ruleId: "rule-1",
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toMatchObject({
      name: "UserFacingError",
      kind: "server",
    });
  });
});

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
