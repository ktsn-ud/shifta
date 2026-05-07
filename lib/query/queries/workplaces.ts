import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";

type RelatedCounts = {
  shifts: number;
  payrollRules: number;
  timetableSets: number;
};

export type WorkplaceListItem = {
  id: string;
  name: string;
  type: WorkplaceType;
  color: string;
  _count: RelatedCounts;
};

export type WorkplaceDetailItem = {
  id: string;
  name: string;
  type: WorkplaceType;
  color: string;
};

export type PayrollRuleListItem = {
  id: string;
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: number | string;
  holidayAllowanceHourly: number | string;
  nightPremiumRate: number | string;
  overtimePremiumRate: number | string;
  dailyOvertimeThreshold: number | string;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

export type TimetableSetItem = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    timetableSetId: string;
    period: number;
    startTime: string;
    endTime: string;
    startTimeLabel?: string;
    endTimeLabel?: string;
  }[];
};

function parseListPayload<TData>(payload: unknown): TData[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { data?: unknown[] }).data)
  ) {
    throw new Error("WORKPLACE_LIST_RESPONSE_INVALID");
  }

  return (payload as { data: TData[] }).data;
}

function parseItemPayload<TData>(payload: unknown): TData {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { data?: unknown }).data !== "object" ||
    (payload as { data?: unknown }).data === null
  ) {
    throw new Error("WORKPLACE_ITEM_RESPONSE_INVALID");
  }

  return (payload as { data: TData }).data;
}

export function useWorkplacesQuery(input: {
  userId: string;
  includeCounts: boolean;
  initialData?: WorkplaceListItem[];
}) {
  const { includeCounts, initialData, userId } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.list({ userId, includeCounts }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        includeCounts: includeCounts ? "true" : "false",
      });
      return fetchJson(`/api/workplaces?${params.toString()}`, {
        init: { signal },
        fallbackMessage: "勤務先一覧の取得に失敗しました。",
        parse: (payload) => parseListPayload<WorkplaceListItem>(payload),
      });
    },
    initialData,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useWorkplaceDetailQuery(input: {
  workplaceId: string;
  initialData?: WorkplaceDetailItem | null;
}) {
  const { initialData, workplaceId } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.detail({ workplaceId }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}`, {
        init: { signal },
        fallbackMessage: "勤務先の取得に失敗しました。",
        parse: (payload) => parseItemPayload<WorkplaceDetailItem>(payload),
      }),
    initialData: initialData ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useWorkplacePayrollRulesQuery(input: {
  workplaceId: string;
  initialData?: PayrollRuleListItem[];
}) {
  const { initialData, workplaceId } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.payrollRules({ workplaceId }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}/payroll-rules`, {
        init: { signal },
        fallbackMessage: "給与ルール一覧の取得に失敗しました。",
        parse: (payload) => parseListPayload<PayrollRuleListItem>(payload),
      }),
    initialData,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useWorkplaceTimetablesQuery(input: {
  workplaceId: string;
  enabled?: boolean;
  initialData?: TimetableSetItem[];
}) {
  const { enabled = true, initialData, workplaceId } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.timetables({ workplaceId }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}/timetables`, {
        init: { signal },
        fallbackMessage: "時間割一覧の取得に失敗しました。",
        parse: (payload) => parseListPayload<TimetableSetItem>(payload),
      }),
    enabled,
    initialData,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
