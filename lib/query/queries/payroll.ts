import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";
import {
  actualPayrollResponseSchema,
  payrollDetailsMonthlyResponseSchema,
  payrollDetailsWorkplaceYearlyResponseSchema,
  payrollPreviewBaselineResponseSchema,
  payrollSummaryAmountResponseSchema,
  payrollSummaryResponseSchema,
  payrollSummaryYearContextResponseSchema,
} from "@/lib/query/dto-schemas/payroll";
import { type ActualPayrollEditorResult } from "@/lib/payroll/actual-editor";
import { type PayrollDetailsMonthlyResult } from "@/lib/payroll/details";
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";
import { type PayrollPreviewBaselineResult } from "@/lib/payroll/preview-baseline";
import {
  type PayrollSummaryAmountResult,
  type PayrollSummaryResult,
  type PayrollSummaryYearContextResult,
} from "@/lib/payroll/summary";

const PAYROLL_STALE_TIME_MS = 2 * 60 * 1000;
const PAYROLL_GC_TIME_MS = 10 * 60 * 1000;

function parsePayload<TData>(
  schema: z.ZodType<TData>,
  payload: unknown,
  errorCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(errorCode);
  }

  return result.data;
}

function hasCompleteMonthRows(
  rows: Array<{ month: number; monthKey: string }>,
  expectedYear: number,
): boolean {
  if (rows.length !== 12) {
    return false;
  }

  for (const [index, row] of rows.entries()) {
    const expectedMonth = index + 1;
    if (
      row.month !== expectedMonth ||
      row.monthKey !==
        `${expectedYear}-${String(expectedMonth).padStart(2, "0")}`
    ) {
      return false;
    }
  }

  return true;
}

function hasExactOrderedMonths(
  receivedMonths: string[],
  expectedMonths: string[],
): boolean {
  return (
    receivedMonths.length === expectedMonths.length &&
    receivedMonths.every((month, index) => month === expectedMonths[index])
  );
}

function parsePayrollSummaryPayload(
  expectedYear: number,
): (payload: unknown) => PayrollSummaryResult {
  return (payload) => {
    const result = parsePayload(
      payrollSummaryResponseSchema,
      payload,
      "PAYROLL_SUMMARY_RESPONSE_INVALID",
    );

    if (
      result.year !== expectedYear ||
      !hasCompleteMonthRows(result.months, expectedYear)
    ) {
      throw new Error("PAYROLL_SUMMARY_RESPONSE_INVALID");
    }

    return result;
  };
}

function parsePayrollSummaryYearContextPayload(
  expectedMonth: string,
): (payload: unknown) => PayrollSummaryYearContextResult {
  return (payload) => {
    const result = parsePayload(
      payrollSummaryYearContextResponseSchema,
      payload,
      "PAYROLL_SUMMARY_YEAR_CONTEXT_RESPONSE_INVALID",
    );
    if (result.month !== expectedMonth) {
      throw new Error("PAYROLL_SUMMARY_YEAR_CONTEXT_RESPONSE_INVALID");
    }

    return result;
  };
}

function parsePayrollSummaryAmountPayload(
  expectedMonth: string,
): (payload: unknown) => PayrollSummaryAmountResult {
  return (payload) => {
    const result = parsePayload(
      payrollSummaryAmountResponseSchema,
      payload,
      "PAYROLL_SUMMARY_AMOUNT_RESPONSE_INVALID",
    );
    if (result.month !== expectedMonth) {
      throw new Error("PAYROLL_SUMMARY_AMOUNT_RESPONSE_INVALID");
    }

    return result;
  };
}

function parseActualPayrollPayload(
  expectedMonth: string,
): (payload: unknown) => ActualPayrollEditorResult {
  return (payload) => {
    const result = parsePayload(
      actualPayrollResponseSchema,
      payload,
      "ACTUAL_PAYROLL_RESPONSE_INVALID",
    );
    if (result.month !== expectedMonth) {
      throw new Error("ACTUAL_PAYROLL_RESPONSE_INVALID");
    }

    return result;
  };
}

function parsePayrollDetailsMonthlyPayload(
  expectedMonth: string,
): (payload: unknown) => PayrollDetailsMonthlyResult {
  return (payload) => {
    const result = parsePayload(
      payrollDetailsMonthlyResponseSchema,
      payload,
      "PAYROLL_DETAILS_MONTHLY_RESPONSE_INVALID",
    );
    if (result.month !== expectedMonth) {
      throw new Error("PAYROLL_DETAILS_MONTHLY_RESPONSE_INVALID");
    }

    return result;
  };
}

function parsePayrollDetailsWorkplaceYearlyPayload(
  expectedYear: number,
): (payload: unknown) => PayrollDetailsWorkplaceYearlyResult {
  return (payload) => {
    const result = parsePayload(
      payrollDetailsWorkplaceYearlyResponseSchema,
      payload,
      "PAYROLL_DETAILS_WORKPLACE_YEARLY_RESPONSE_INVALID",
    );
    if (
      result.year !== expectedYear ||
      !result.workplaces.every((workplace) =>
        hasCompleteMonthRows(workplace.months, expectedYear),
      )
    ) {
      throw new Error("PAYROLL_DETAILS_WORKPLACE_YEARLY_RESPONSE_INVALID");
    }

    return result;
  };
}

function parsePayrollPreviewBaselinePayload(
  expectedMonths: string[],
): (payload: unknown) => PayrollPreviewBaselineResult {
  return (payload) => {
    const result = parsePayload(
      payrollPreviewBaselineResponseSchema,
      payload,
      "PAYROLL_PREVIEW_BASELINE_RESPONSE_INVALID",
    );
    const receivedMonths = result.data.months.map((item) => item.month);
    if (!hasExactOrderedMonths(receivedMonths, expectedMonths)) {
      throw new Error("PAYROLL_PREVIEW_BASELINE_RESPONSE_INVALID");
    }

    return result;
  };
}

export function usePayrollSummaryQuery(input: {
  userId: string;
  year: number;
  enabled?: boolean;
  initialData?: PayrollSummaryResult;
}) {
  const { enabled = true, initialData, year, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.summary({ userId, year }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ year: String(year) });
      return fetchJson(`/api/payroll/summary?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "給与集計の取得に失敗しました。",
        parse: parsePayrollSummaryPayload(year),
      });
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function usePayrollSummaryYearContextQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: PayrollSummaryYearContextResult;
}) {
  const { enabled = true, initialData, month, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.summaryYearContext({ userId, month }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      return fetchJson(
        `/api/payroll/summary-year-context?${params.toString()}`,
        {
          init: {
            signal,
            cache: "no-store",
          },
          fallbackMessage: "給与集計の累計情報取得に失敗しました。",
          parse: parsePayrollSummaryYearContextPayload(month),
        },
      );
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function usePayrollSummaryAmountQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: PayrollSummaryAmountResult;
}) {
  const { enabled = true, initialData, month, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.summaryAmount({ userId, month }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      return fetchJson(`/api/payroll/summary-amount?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "次回支給額の取得に失敗しました。",
        parse: parsePayrollSummaryAmountPayload(month),
      });
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function useActualPayrollQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: ActualPayrollEditorResult;
}) {
  const { enabled = true, initialData, month, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.actual({ userId, month }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      return fetchJson(`/api/payroll/actual?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "実給与の取得に失敗しました。",
        parse: parseActualPayrollPayload(month),
      });
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function usePayrollDetailsMonthlyQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: PayrollDetailsMonthlyResult;
}) {
  const { enabled = true, initialData, month, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.detailsMonthly({ userId, month }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      return fetchJson(`/api/payroll/details/monthly?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "給与詳細（月毎表示）の取得に失敗しました。",
        parse: parsePayrollDetailsMonthlyPayload(month),
      });
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function usePayrollDetailsWorkplaceYearlyQuery(input: {
  userId: string;
  year: number;
  enabled?: boolean;
  initialData?: PayrollDetailsWorkplaceYearlyResult;
}) {
  const { enabled = true, initialData, userId, year } = input;

  return useQuery({
    queryKey: queryKeys.payroll.detailsWorkplaceYearly({
      userId,
      workplaceId: "all",
      year,
    }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ year: String(year) });
      return fetchJson(
        `/api/payroll/details/workplace-yearly?${params.toString()}`,
        {
          init: {
            signal,
            cache: "no-store",
          },
          fallbackMessage: "給与詳細（勤務先毎表示）の取得に失敗しました。",
          parse: parsePayrollDetailsWorkplaceYearlyPayload(year),
        },
      );
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}

export function usePayrollPreviewBaselineQuery(input: {
  userId: string;
  months: string[];
  enabled?: boolean;
  initialData?: PayrollPreviewBaselineResult;
}) {
  const { enabled = true, initialData, months, userId } = input;
  const normalizedMonths = Array.from(new Set(months)).sort((left, right) =>
    left.localeCompare(right),
  );

  return useQuery({
    queryKey: queryKeys.payroll.previewBaseline({
      userId,
      months: normalizedMonths,
    }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        months: normalizedMonths.join(","),
      });
      return fetchJson(`/api/payroll/preview-baseline?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "プレビュー用支給見込の取得に失敗しました。",
        parse: parsePayrollPreviewBaselinePayload(normalizedMonths),
      });
    },
    enabled: enabled && normalizedMonths.length > 0,
    initialData,
    staleTime: 30 * 1000,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}
