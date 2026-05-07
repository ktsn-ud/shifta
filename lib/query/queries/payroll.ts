import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";
import { type PayrollDetailsMonthlyResult } from "@/lib/payroll/details";
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";
import { type PayrollSummaryResult } from "@/lib/payroll/summary";

const PAYROLL_STALE_TIME_MS = 2 * 60 * 1000;
const PAYROLL_GC_TIME_MS = 10 * 60 * 1000;

function parsePayrollSummaryPayload(payload: unknown): PayrollSummaryResult {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { totalWage?: unknown }).totalWage !== "number" ||
    !Array.isArray((payload as { byWorkplace?: unknown[] }).byWorkplace)
  ) {
    throw new Error("PAYROLL_SUMMARY_RESPONSE_INVALID");
  }

  return payload as PayrollSummaryResult;
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

export function usePayrollSummaryQuery(input: {
  userId: string;
  month: string;
  enabled?: boolean;
  initialData?: PayrollSummaryResult;
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
    staleTime: PAYROLL_STALE_TIME_MS,
    gcTime: PAYROLL_GC_TIME_MS,
  });
}
