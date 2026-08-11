import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchJson } from "@/lib/query/fetch-json";
import {
  actualPayrollResponseSchema,
  payrollDetailsMonthlyResponseSchema,
  payrollDetailsWorkplaceYearlyResponseSchema,
  payrollPreviewBaselineResponseSchema,
  payrollSummaryAmountResponseSchema,
  payrollSummaryResponseSchema,
  payrollSummaryYearContextResponseSchema,
} from "@/lib/query/dto-schemas/payroll";
import {
  useActualPayrollQuery,
  usePayrollDetailsMonthlyQuery,
  usePayrollDetailsWorkplaceYearlyQuery,
  usePayrollPreviewBaselineQuery,
  usePayrollSummaryAmountQuery,
  usePayrollSummaryQuery,
  usePayrollSummaryYearContextQuery,
} from "@/lib/query/queries/payroll";

const workplace = {
  workplaceId: "workplace-1",
  workplaceName: "勤務先A",
  workplaceColor: "#3366FF",
};

const amounts = {
  taxableAmount: 1200,
  nonTaxableAmount: 0,
  totalAmount: 1200,
};

const coverage = {
  ...amounts,
  registeredWorkplaceCount: 1,
  totalWorkplaceCount: 1,
  isPartial: false,
};

const displayValue = {
  estimatedAmount: 1200,
  actualAmount: null,
  displayAmount: 1200,
  differenceAmount: 0,
  isActualApplied: false,
};

const breakdown = {
  totalWorkHours: 1,
  baseHours: 1,
  holidayHours: 0,
  nightHours: 0,
  overtimeHours: 0,
  totalWage: 1200,
  baseWage: 1200,
  holidayWage: 0,
  nightWage: 0,
  workDuration: "1:00",
  baseDuration: "1:00",
  holidayDuration: "0:00",
  nightDuration: "0:00",
  overtimeDuration: "0:00",
  effectiveBaseHourlyWage: 1200,
  effectiveHolidayAllowanceHourly: null,
  effectiveNightHourlyWage: null,
  effectiveNightPremiumRate: null,
};

const payrollSummaryPayload = {
  year: 2026,
  workplaces: [workplace],
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    monthKey: `2026-${String(index + 1).padStart(2, "0")}`,
    incomeByWorkplace: [{ workplaceId: "workplace-1", ...amounts }],
    hoursByWorkplace: [{ workplaceId: "workplace-1", totalWorkHours: 1 }],
    totals: { ...amounts, totalWorkHours: 1 },
  })),
  yearlyTotals: {
    byWorkplace: [
      { workplaceId: "workplace-1", ...amounts, totalWorkHours: 1 },
    ],
    grandTotals: { ...amounts, totalWorkHours: 1 },
  },
};

const payrollSummaryYearContextPayload = {
  month: "2026-01",
  currentMonthCumulative: 1200,
  yearlyTotal: 1200,
  currentMonthActualCoverage: coverage,
  yearlyActualCoverage: coverage,
  estimatedCurrentMonthCumulative: 1200,
  estimatedYearlyTotal: 1200,
};

const payrollSummaryAmountPayload = {
  month: "2026-01",
  totalWage: 1200,
};

const actualPayrollPayload = {
  month: "2026-01",
  rows: [
    {
      ...workplace,
      periodStartDate: "2025-12-16",
      periodEndDate: "2026-01-15",
      estimatedAmount: 1200,
      taxableAmount: null,
      nonTaxableAmount: null,
      totalActualAmount: null,
      displayAmount: 1200,
      differenceAmount: 0,
      note: null,
      hasActualPayroll: false,
    },
  ],
};

const payrollDetailsMonthlyPayload = {
  month: "2026-01",
  shiftCount: 1,
  totals: breakdown,
  totalsDisplayValue: displayValue,
  actualCoverage: coverage,
  byWorkplace: [
    {
      ...workplace,
      periodStartDate: "2025-12-16",
      periodEndDate: "2026-01-15",
      displayValue,
      actualPayroll: null,
      ...breakdown,
    },
  ],
};

const payrollDetailsWorkplaceYearlyPayload = {
  year: 2026,
  shiftCount: 1,
  workplaces: [
    {
      ...workplace,
      shiftCount: 1,
      yearlyTotals: breakdown,
      yearlyDisplayValue: displayValue,
      actualCoverage: coverage,
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        monthKey: `2026-${String(index + 1).padStart(2, "0")}`,
        periodStartDate: "2025-12-16",
        periodEndDate: "2026-01-15",
        displayValue,
        actualPayroll: null,
        ...breakdown,
      })),
    },
  ],
};

const payrollPreviewBaselinePayload = {
  data: {
    months: [
      {
        month: "2026-01",
        totalWage: 1200,
        byWorkplace: [
          {
            workplaceId: "workplace-1",
            wage: 1200,
            periodStartDate: "2025-12-16",
            periodEndDate: "2026-01-15",
          },
        ],
      },
    ],
  },
};

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

describe("給与クエリ DTO スキーマ", () => {
  it.each([
    ["年次サマリー", payrollSummaryResponseSchema, payrollSummaryPayload],
    [
      "年次サマリー累計",
      payrollSummaryYearContextResponseSchema,
      payrollSummaryYearContextPayload,
    ],
    [
      "次回支給額",
      payrollSummaryAmountResponseSchema,
      payrollSummaryAmountPayload,
    ],
    ["実給与編集", actualPayrollResponseSchema, actualPayrollPayload],
    [
      "給与詳細（月毎）",
      payrollDetailsMonthlyResponseSchema,
      payrollDetailsMonthlyPayload,
    ],
    [
      "給与詳細（勤務先毎）",
      payrollDetailsWorkplaceYearlyResponseSchema,
      payrollDetailsWorkplaceYearlyPayload,
    ],
    [
      "支給見込プレビュー",
      payrollPreviewBaselineResponseSchema,
      payrollPreviewBaselinePayload,
    ],
  ])("実際の DTO 形状の %s レスポンスを受理する", (_name, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("未知キーと必須ネスト項目の欠落を拒否する", () => {
    const unknownKeyPayload = copy(payrollSummaryPayload);
    Reflect.set(unknownKeyPayload.months[0].totals, "unexpected", true);
    const missingNestedPayload = copy(payrollDetailsMonthlyPayload);
    Reflect.deleteProperty(missingNestedPayload.byWorkplace[0], "displayValue");

    expect(
      payrollSummaryResponseSchema.safeParse(unknownKeyPayload).success,
    ).toBe(false);
    expect(
      payrollDetailsMonthlyResponseSchema.safeParse(missingNestedPayload)
        .success,
    ).toBe(false);
  });

  it("null の行と非有限数を含むネスト値を拒否する", () => {
    const nullRowPayload = copy(actualPayrollPayload);
    nullRowPayload.rows[0] = null as never;
    const infiniteAmountPayload = copy(payrollSummaryYearContextPayload);
    infiniteAmountPayload.currentMonthActualCoverage.totalAmount = Infinity;
    const nanBreakdownPayload = copy(payrollDetailsMonthlyPayload);
    nanBreakdownPayload.totals.totalWorkHours = Number.NaN;

    expect(actualPayrollResponseSchema.safeParse(nullRowPayload).success).toBe(
      false,
    );
    expect(
      payrollSummaryYearContextResponseSchema.safeParse(infiniteAmountPayload)
        .success,
    ).toBe(false);
    expect(
      payrollDetailsMonthlyResponseSchema.safeParse(nanBreakdownPayload)
        .success,
    ).toBe(false);
  });

  it("件数は非負の整数だけを受理する", () => {
    const negativeCountPayload = copy(payrollDetailsMonthlyPayload);
    negativeCountPayload.shiftCount = -1;
    const fractionalCountPayload = copy(payrollDetailsWorkplaceYearlyPayload);
    fractionalCountPayload.workplaces[0].shiftCount = 0.5;

    expect(
      payrollDetailsMonthlyResponseSchema.safeParse(negativeCountPayload)
        .success,
    ).toBe(false);
    expect(
      payrollDetailsWorkplaceYearlyResponseSchema.safeParse(
        fractionalCountPayload,
      ).success,
    ).toBe(false);
  });

  it("月番号は 1 から 12、月キーと日付は正しい形式だけを受理する", () => {
    const zeroMonthPayload = copy(payrollSummaryPayload);
    zeroMonthPayload.months[0].month = 0;
    const thirteenthMonthPayload = copy(payrollDetailsWorkplaceYearlyPayload);
    thirteenthMonthPayload.workplaces[0].months[0].month = 13;
    const invalidMonthKeyPayload = copy(payrollSummaryAmountPayload);
    invalidMonthKeyPayload.month = "2026-13";
    const invalidDatePayload = copy(payrollPreviewBaselinePayload);
    invalidDatePayload.data.months[0].byWorkplace[0].periodEndDate =
      "2026-02-30";

    expect(
      payrollSummaryResponseSchema.safeParse(zeroMonthPayload).success,
    ).toBe(false);
    expect(
      payrollDetailsWorkplaceYearlyResponseSchema.safeParse(
        thirteenthMonthPayload,
      ).success,
    ).toBe(false);
    expect(
      payrollSummaryAmountResponseSchema.safeParse(invalidMonthKeyPayload)
        .success,
    ).toBe(false);
    expect(
      payrollPreviewBaselineResponseSchema.safeParse(invalidDatePayload)
        .success,
    ).toBe(false);
  });

  it("nullable な実給与値は null を受理し、不正な値を拒否する", () => {
    const invalidActualValuePayload = copy(actualPayrollPayload);
    invalidActualValuePayload.rows[0].taxableAmount = "1200" as never;
    const invalidActualRecordPayload = copy(payrollDetailsMonthlyPayload);
    invalidActualRecordPayload.byWorkplace[0].actualPayroll = {
      ...amounts,
      note: 1,
    } as never;

    expect(
      actualPayrollResponseSchema.safeParse(actualPayrollPayload).success,
    ).toBe(true);
    expect(
      payrollDetailsMonthlyResponseSchema.safeParse(
        payrollDetailsMonthlyPayload,
      ).success,
    ).toBe(true);
    expect(
      actualPayrollResponseSchema.safeParse(invalidActualValuePayload).success,
    ).toBe(false);
    expect(
      payrollDetailsMonthlyResponseSchema.safeParse(invalidActualRecordPayload)
        .success,
    ).toBe(false);
  });
});

describe("給与クエリの fetchJson 境界", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("DTO パーサーがレスポンスを拒否した場合は fallback 付きの server エラーに変換する", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse({ month: "2026-13", totalWage: 1200 }),
    );

    await expect(
      fetchJson("/api/payroll/summary-amount?month=2026-01", {
        fallbackMessage: "次回支給額の取得に失敗しました。",
        parse: (payload) => payrollSummaryAmountResponseSchema.parse(payload),
      }),
    ).rejects.toMatchObject({
      name: "UserFacingError",
      kind: "server",
      status: 500,
      message:
        "次回支給額の取得に失敗しました。 時間をおいてから再実行してください。",
    });
  });

  const requestedValueMismatchCases = [
    {
      name: "年次サマリーのレスポンス年",
      fallbackMessage: "給与集計の取得に失敗しました。",
      payload: { ...copy(payrollSummaryPayload), year: 2027 },
      useQuery: () => usePayrollSummaryQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "年次サマリー累計のレスポンス月",
      fallbackMessage: "給与集計の累計情報取得に失敗しました。",
      payload: { ...copy(payrollSummaryYearContextPayload), month: "2026-02" },
      useQuery: () =>
        usePayrollSummaryYearContextQuery({
          userId: "user-1",
          month: "2026-01",
        }),
    },
    {
      name: "次回支給額のレスポンス月",
      fallbackMessage: "次回支給額の取得に失敗しました。",
      payload: { ...copy(payrollSummaryAmountPayload), month: "2026-02" },
      useQuery: () =>
        usePayrollSummaryAmountQuery({ userId: "user-1", month: "2026-01" }),
    },
    {
      name: "実給与編集のレスポンス月",
      fallbackMessage: "実給与の取得に失敗しました。",
      payload: { ...copy(actualPayrollPayload), month: "2026-02" },
      useQuery: () =>
        useActualPayrollQuery({ userId: "user-1", month: "2026-01" }),
    },
    {
      name: "給与詳細（月毎）のレスポンス月",
      fallbackMessage: "給与詳細（月毎表示）の取得に失敗しました。",
      payload: { ...copy(payrollDetailsMonthlyPayload), month: "2026-02" },
      useQuery: () =>
        usePayrollDetailsMonthlyQuery({ userId: "user-1", month: "2026-01" }),
    },
    {
      name: "給与詳細（勤務先毎）のレスポンス年",
      fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
      payload: { ...copy(payrollDetailsWorkplaceYearlyPayload), year: 2027 },
      useQuery: () =>
        usePayrollDetailsWorkplaceYearlyQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "支給見込プレビューのレスポンス月集合",
      fallbackMessage: "プレビュー用支給見込の取得に失敗しました。",
      payload: {
        data: {
          months: [
            {
              ...copy(payrollPreviewBaselinePayload).data.months[0],
              month: "2026-02",
            },
          ],
        },
      },
      useQuery: () =>
        usePayrollPreviewBaselineQuery({
          userId: "user-1",
          months: ["2026-01"],
        }),
    },
  ].map(({ name, fallbackMessage, payload, useQuery }) => ({
    name,
    run: createInvalidResponseRun({ fallbackMessage, payload, useQuery }),
  }));

  it.each(requestedValueMismatchCases)(
    "$name が要求値と一致しない場合は fallback 付きの server エラーに変換する",
    async ({ run }) => {
      await run();
    },
  );

  const responseIntegrityMismatchCases = [
    {
      name: "年次サマリーが12か月未満",
      fallbackMessage: "給与集計の取得に失敗しました。",
      payload: {
        ...copy(payrollSummaryPayload),
        months: copy(payrollSummaryPayload).months.slice(0, 11),
      },
      useQuery: () => usePayrollSummaryQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "年次サマリーの月番号重複",
      fallbackMessage: "給与集計の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollSummaryPayload);
        payload.months[11] = copy(payload.months[0]);
        return payload;
      })(),
      useQuery: () => usePayrollSummaryQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "年次サマリーの1月と2月が並び替わっている",
      fallbackMessage: "給与集計の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollSummaryPayload);
        [payload.months[0], payload.months[1]] = [
          payload.months[1],
          payload.months[0],
        ];
        return payload;
      })(),
      useQuery: () => usePayrollSummaryQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "年次サマリーの月番号と月キー不一致",
      fallbackMessage: "給与集計の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollSummaryPayload);
        payload.months[0].monthKey = "2026-02";
        return payload;
      })(),
      useQuery: () => usePayrollSummaryQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "勤務先別年次詳細が12か月未満",
      fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollDetailsWorkplaceYearlyPayload);
        payload.workplaces[0].months = payload.workplaces[0].months.slice(
          0,
          11,
        );
        return payload;
      })(),
      useQuery: () =>
        usePayrollDetailsWorkplaceYearlyQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "勤務先別年次詳細の月番号重複",
      fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollDetailsWorkplaceYearlyPayload);
        payload.workplaces[0].months[11] = copy(
          payload.workplaces[0].months[0],
        );
        return payload;
      })(),
      useQuery: () =>
        usePayrollDetailsWorkplaceYearlyQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "勤務先別年次詳細の1月と2月が並び替わっている",
      fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollDetailsWorkplaceYearlyPayload);
        [payload.workplaces[0].months[0], payload.workplaces[0].months[1]] = [
          payload.workplaces[0].months[1],
          payload.workplaces[0].months[0],
        ];
        return payload;
      })(),
      useQuery: () =>
        usePayrollDetailsWorkplaceYearlyQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "勤務先別年次詳細の月番号と月キー不一致",
      fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
      payload: (() => {
        const payload = copy(payrollDetailsWorkplaceYearlyPayload);
        payload.workplaces[0].months[0].monthKey = "2026-02";
        return payload;
      })(),
      useQuery: () =>
        usePayrollDetailsWorkplaceYearlyQuery({ userId: "user-1", year: 2026 }),
    },
    {
      name: "支給見込プレビューに要求月が欠落",
      fallbackMessage: "プレビュー用支給見込の取得に失敗しました。",
      payload: { data: { months: [] } },
      useQuery: () =>
        usePayrollPreviewBaselineQuery({
          userId: "user-1",
          months: ["2026-01", "2026-02"],
        }),
    },
    {
      name: "支給見込プレビューに未要求月が含まれる",
      fallbackMessage: "プレビュー用支給見込の取得に失敗しました。",
      payload: {
        data: {
          months: [
            copy(payrollPreviewBaselinePayload).data.months[0],
            {
              ...copy(payrollPreviewBaselinePayload).data.months[0],
              month: "2026-02",
            },
          ],
        },
      },
      useQuery: () =>
        usePayrollPreviewBaselineQuery({
          userId: "user-1",
          months: ["2026-01"],
        }),
    },
    {
      name: "支給見込プレビューの月が重複",
      fallbackMessage: "プレビュー用支給見込の取得に失敗しました。",
      payload: {
        data: {
          months: [
            copy(payrollPreviewBaselinePayload).data.months[0],
            copy(payrollPreviewBaselinePayload).data.months[0],
          ],
        },
      },
      useQuery: () =>
        usePayrollPreviewBaselineQuery({
          userId: "user-1",
          months: ["2026-01"],
        }),
    },
  ].map(({ name, fallbackMessage, payload, useQuery }) => ({
    name,
    run: createInvalidResponseRun({ fallbackMessage, payload, useQuery }),
  }));

  it.each(responseIntegrityMismatchCases)(
    "$name を拒否する",
    async ({ run }) => {
      await run();
    },
  );
});
