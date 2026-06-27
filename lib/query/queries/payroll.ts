import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";
import { type ActualPayrollEditorResult } from "@/lib/payroll/actual-editor";
import { type PayrollDetailsMonthlyResult } from "@/lib/payroll/details";
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";
import { type PayrollPreviewBaselineResult } from "@/lib/payroll/preview-baseline";
import {
  type PayrollSummaryCoreResult,
  type PayrollSummaryYearContextResult,
} from "@/lib/payroll/summary";

const PAYROLL_STALE_TIME_MS = 2 * 60 * 1000;
const PAYROLL_GC_TIME_MS = 10 * 60 * 1000;

function parsePayrollSummaryPayload(
  payload: unknown,
): PayrollSummaryCoreResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { totalWage?: unknown }).totalWage !== "number" ||
    !Array.isArray((payload as { byWorkplace?: unknown[] }).byWorkplace)
  ) {
    throw new Error("PAYROLL_SUMMARY_RESPONSE_INVALID");
  }

  return payload as PayrollSummaryCoreResult;
}

function parsePayrollSummaryYearContextPayload(
  payload: unknown,
): PayrollSummaryYearContextResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { month?: unknown }).month !== "string" ||
    typeof (payload as { currentMonthCumulative?: unknown })
      .currentMonthCumulative !== "number" ||
    typeof (payload as { yearlyTotal?: unknown }).yearlyTotal !== "number"
  ) {
    throw new Error("PAYROLL_SUMMARY_YEAR_CONTEXT_RESPONSE_INVALID");
  }

  return payload as PayrollSummaryYearContextResult;
}

function parseActualPayrollPayload(
  payload: unknown,
): ActualPayrollEditorResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { month?: unknown }).month !== "string" ||
    !Array.isArray((payload as { rows?: unknown[] }).rows)
  ) {
    throw new Error("ACTUAL_PAYROLL_RESPONSE_INVALID");
  }

  return payload as ActualPayrollEditorResult;
}

function parsePayrollDetailsMonthlyPayload(
  payload: unknown,
): PayrollDetailsMonthlyResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { month?: unknown }).month !== "string" ||
    typeof (payload as { totals?: { totalWage?: unknown } }).totals
      ?.totalWage !== "number"
  ) {
    throw new Error("PAYROLL_DETAILS_MONTHLY_RESPONSE_INVALID");
  }

  return payload as PayrollDetailsMonthlyResult;
}

function parsePayrollDetailsWorkplaceYearlyPayload(
  payload: unknown,
): PayrollDetailsWorkplaceYearlyResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { year?: unknown }).year !== "number" ||
    !Array.isArray((payload as { workplaces?: unknown[] }).workplaces)
  ) {
    throw new Error("PAYROLL_DETAILS_WORKPLACE_YEARLY_RESPONSE_INVALID");
  }

  return payload as PayrollDetailsWorkplaceYearlyResult;
}

function parsePayrollPreviewBaselinePayload(
  payload: unknown,
): PayrollPreviewBaselineResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { data?: unknown }).data !== "object" ||
    (payload as { data?: { months?: unknown } }).data === null ||
    !Array.isArray((payload as { data?: { months?: unknown[] } }).data?.months)
  ) {
    throw new Error("PAYROLL_PREVIEW_BASELINE_RESPONSE_INVALID");
  }

  return payload as PayrollPreviewBaselineResult;
}

export function usePayrollSummaryQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: PayrollSummaryCoreResult;
}) {
  const { enabled = true, initialData, month, userId } = input;

  return useQuery({
    queryKey: queryKeys.payroll.summary({ userId, month }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      return fetchJson(`/api/payroll/summary?${params.toString()}`, {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "給与集計の取得に失敗しました。",
        parse: parsePayrollSummaryPayload,
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
          parse: parsePayrollSummaryYearContextPayload,
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
        parse: parseActualPayrollPayload,
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
        parse: parsePayrollDetailsMonthlyPayload,
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
          parse: parsePayrollDetailsWorkplaceYearlyPayload,
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
        parse: parsePayrollPreviewBaselinePayload,
      });
    },
    enabled: enabled && normalizedMonths.length > 0,
    initialData,
    staleTime: 30 * 1000,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}
