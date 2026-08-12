import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  unconfirmedShiftCountResponseSchema,
  unconfirmedShiftsResponseSchema,
} from "@/lib/query/dto-schemas/shift-confirmation";
import {
  useUnconfirmedShiftCountQuery,
  useUnconfirmedShiftsQuery,
} from "@/lib/query/queries/shift-confirmation";

function createUnconfirmedShiftsPayload() {
  return {
    shifts: [
      {
        id: "shift-1",
        workplaceId: "workplace-1",
        comment: null,
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "10:00",
        breakMinutes: 0,
        isConfirmed: false,
        workplace: {
          id: "workplace-1",
          name: "勤務先A",
          color: "#3366FF",
        },
      },
    ],
  };
}

function createUnconfirmedShiftCountPayload() {
  return { count: 1 };
}

function createMockResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

type QueryResultWithError = Readonly<{ error: unknown }>;

function createInvalidResponseRun(input: {
  fallbackMessage: string;
  payload: unknown;
  useQuery: () => QueryResultWithError;
}): () => Promise<void> {
  return async () => {
    const queryClient = createQueryClient();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(createMockResponse(input.payload));

    const { result } = renderHook(input.useQuery, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        name: "UserFacingError",
        kind: "server",
        status: 500,
        message: expect.stringContaining(input.fallbackMessage),
      });
    });
  };
}

describe("未確定シフトクエリ DTO スキーマ", () => {
  it.each([
    [
      "未確定シフト一覧",
      unconfirmedShiftsResponseSchema,
      createUnconfirmedShiftsPayload(),
    ],
    [
      "未確定シフト件数",
      unconfirmedShiftCountResponseSchema,
      createUnconfirmedShiftCountPayload(),
    ],
  ])("実際の DTO 形状の %s レスポンスを受理する", (_name, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("未知キー、null 行、勤務先ネストの欠落を拒否する", () => {
    const unknownKeyPayload = createUnconfirmedShiftsPayload();
    Reflect.set(unknownKeyPayload.shifts[0].workplace, "unexpected", true);
    const nullRowPayload = createUnconfirmedShiftsPayload();
    nullRowPayload.shifts[0] = null as never;
    const missingWorkplacePayload = createUnconfirmedShiftsPayload();
    Reflect.deleteProperty(missingWorkplacePayload.shifts[0], "workplace");

    expect(
      unconfirmedShiftsResponseSchema.safeParse(unknownKeyPayload).success,
    ).toBe(false);
    expect(
      unconfirmedShiftsResponseSchema.safeParse(nullRowPayload).success,
    ).toBe(false);
    expect(
      unconfirmedShiftsResponseSchema.safeParse(missingWorkplacePayload)
        .success,
    ).toBe(false);
  });

  it("未確定フラグ、日付、時刻が欠落または不正な行を拒否する", () => {
    const missingConfirmedPayload = createUnconfirmedShiftsPayload();
    Reflect.deleteProperty(missingConfirmedPayload.shifts[0], "isConfirmed");
    const invalidDatePayload = createUnconfirmedShiftsPayload();
    invalidDatePayload.shifts[0].date = "2026-02-30";
    const invalidTimePayload = createUnconfirmedShiftsPayload();
    invalidTimePayload.shifts[0].endTime = "24:00";

    expect(
      unconfirmedShiftsResponseSchema.safeParse(missingConfirmedPayload)
        .success,
    ).toBe(false);
    expect(
      unconfirmedShiftsResponseSchema.safeParse(invalidDatePayload).success,
    ).toBe(false);
    expect(
      unconfirmedShiftsResponseSchema.safeParse(invalidTimePayload).success,
    ).toBe(false);
  });

  it("確定済みの行を未確定シフト一覧レスポンスとして拒否する", () => {
    const confirmedShiftPayload = createUnconfirmedShiftsPayload();
    confirmedShiftPayload.shifts[0].isConfirmed = true;

    expect(
      unconfirmedShiftsResponseSchema.safeParse(confirmedShiftPayload).success,
    ).toBe(false);
  });

  it("休憩分数と未確定件数は非負の整数だけを受理する", () => {
    const negativeBreakPayload = createUnconfirmedShiftsPayload();
    negativeBreakPayload.shifts[0].breakMinutes = -1;
    const fractionalBreakPayload = createUnconfirmedShiftsPayload();
    fractionalBreakPayload.shifts[0].breakMinutes = 0.5;
    const negativeCountPayload = { count: -1 };
    const fractionalCountPayload = { count: 0.5 };

    expect(
      unconfirmedShiftsResponseSchema.safeParse(negativeBreakPayload).success,
    ).toBe(false);
    expect(
      unconfirmedShiftsResponseSchema.safeParse(fractionalBreakPayload).success,
    ).toBe(false);
    expect(
      unconfirmedShiftCountResponseSchema.safeParse(negativeCountPayload)
        .success,
    ).toBe(false);
    expect(
      unconfirmedShiftCountResponseSchema.safeParse(fractionalCountPayload)
        .success,
    ).toBe(false);
  });
});

describe("未確定シフトクエリの fetchJson 境界", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const invalidResponseCases = [
    {
      name: "確定済み行を含む未確定シフト一覧",
      fallbackMessage: "未確定シフトの取得に失敗しました。",
      payload: (() => {
        const payload = createUnconfirmedShiftsPayload();
        payload.shifts[0].isConfirmed = true;
        return payload;
      })(),
      useQuery: () =>
        useUnconfirmedShiftsQuery({
          userId: "user-1",
          initialDataVersion: "version-1",
        }),
    },
    {
      name: "小数の未確定シフト件数",
      fallbackMessage: "未確定シフト件数の取得に失敗しました。",
      payload: { count: 0.5 },
      useQuery: () =>
        useUnconfirmedShiftCountQuery({
          userId: "user-1",
          initialDataVersion: "version-1",
          initialData: 0,
        }),
    },
  ].map(({ name, fallbackMessage, payload, useQuery }) => ({
    name,
    run: createInvalidResponseRun({ fallbackMessage, payload, useQuery }),
  }));

  it.each(invalidResponseCases)(
    "$name を server エラーへ変換する",
    async ({ run }) => {
      await run();
    },
  );
});
