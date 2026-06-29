import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";

type RelatedCounts = {
  shifts: number;
  payrollRules: number;
  timetableSets: number;
};

type ClosingDayType = "DAY_OF_MONTH" | "END_OF_MONTH";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";

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

export type WorkplaceEditDetailItem = WorkplaceDetailItem & {
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
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
  holidayType: HolidayType;
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

export type WorkplaceShiftFormBootstrapData = {
  workplaces: WorkplaceDetailItem[];
  selectedWorkplace: WorkplaceEditDetailItem | null;
  payrollRules: PayrollRuleListItem[];
  timetableSets: TimetableSetItem[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkplaceType(value: unknown): value is WorkplaceType {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
}

function isClosingDayType(value: unknown): value is ClosingDayType {
  return value === "DAY_OF_MONTH" || value === "END_OF_MONTH";
}

function isHolidayType(value: unknown): value is HolidayType {
  return (
    value === "NONE" ||
    value === "WEEKEND" ||
    value === "HOLIDAY" ||
    value === "WEEKEND_HOLIDAY"
  );
}

function isWorkplaceDetailItem(value: unknown): value is WorkplaceDetailItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isWorkplaceType(value.type)
  );
}

function isWorkplaceEditDetailItem(
  value: unknown,
): value is WorkplaceEditDetailItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isWorkplaceType(value.type) &&
    isClosingDayType(value.closingDayType) &&
    (typeof value.closingDay === "number" || value.closingDay === null) &&
    typeof value.payday === "number"
  );
}

function isPayrollRuleListItem(value: unknown): value is PayrollRuleListItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workplaceId === "string" &&
    typeof value.startDate === "string" &&
    (typeof value.endDate === "string" || value.endDate === null) &&
    (typeof value.baseHourlyWage === "number" ||
      typeof value.baseHourlyWage === "string") &&
    (typeof value.holidayAllowanceHourly === "number" ||
      typeof value.holidayAllowanceHourly === "string") &&
    (typeof value.nightPremiumRate === "number" ||
      typeof value.nightPremiumRate === "string") &&
    (typeof value.overtimePremiumRate === "number" ||
      typeof value.overtimePremiumRate === "string") &&
    (typeof value.dailyOvertimeThreshold === "number" ||
      typeof value.dailyOvertimeThreshold === "string") &&
    isHolidayType(value.holidayType)
  );
}

function isTimetableSetItem(value: unknown): value is TimetableSetItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workplaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.sortOrder === "number" &&
    Number.isInteger(value.sortOrder) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.items) &&
    value.items.every((item) => {
      return (
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.timetableSetId === "string" &&
        typeof item.period === "number" &&
        Number.isInteger(item.period) &&
        typeof item.startTime === "string" &&
        typeof item.endTime === "string" &&
        (item.startTimeLabel === undefined ||
          typeof item.startTimeLabel === "string") &&
        (item.endTimeLabel === undefined ||
          typeof item.endTimeLabel === "string")
      );
    })
  );
}

function parseWorkplaceEditDetailPayload(
  payload: unknown,
): WorkplaceEditDetailItem {
  const item = parseItemPayload<unknown>(payload);
  if (!isWorkplaceEditDetailItem(item)) {
    throw new Error("WORKPLACE_EDIT_DETAIL_RESPONSE_INVALID");
  }

  return item;
}

function parseWorkplaceShiftFormBootstrapPayload(
  payload: unknown,
): WorkplaceShiftFormBootstrapData {
  const item = parseItemPayload<unknown>(payload);
  if (!isRecord(item)) {
    throw new Error("WORKPLACE_SHIFT_FORM_BOOTSTRAP_RESPONSE_INVALID");
  }

  const { payrollRules, selectedWorkplace, timetableSets, workplaces } = item;

  if (
    !Array.isArray(workplaces) ||
    workplaces.every(isWorkplaceDetailItem) === false ||
    !Array.isArray(payrollRules) ||
    payrollRules.every(isPayrollRuleListItem) === false ||
    !Array.isArray(timetableSets) ||
    timetableSets.every(isTimetableSetItem) === false ||
    !(
      selectedWorkplace === null ||
      selectedWorkplace === undefined ||
      isWorkplaceEditDetailItem(selectedWorkplace)
    )
  ) {
    throw new Error("WORKPLACE_SHIFT_FORM_BOOTSTRAP_RESPONSE_INVALID");
  }

  return {
    workplaces,
    selectedWorkplace: selectedWorkplace ?? null,
    payrollRules,
    timetableSets,
  };
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
    queryKey: queryKeys.workplaces.detailSummary({ workplaceId }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}?includeCounts=true`, {
        init: { signal },
        fallbackMessage: "勤務先の取得に失敗しました。",
        parse: (payload) => parseItemPayload<WorkplaceDetailItem>(payload),
      }),
    initialData: initialData ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useWorkplaceEditDetailQuery(input: {
  workplaceId: string;
  enabled?: boolean;
  initialData?: WorkplaceEditDetailItem | null;
}) {
  const { enabled = true, initialData, workplaceId } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.editDetail({ workplaceId }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}?includeCounts=false`, {
        init: { signal },
        fallbackMessage: "勤務先の取得に失敗しました。",
        parse: parseWorkplaceEditDetailPayload,
      }),
    enabled,
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

export function useWorkplaceShiftFormBootstrapQuery(input: {
  userId: string;
  selectedWorkplaceId?: string | null;
  enabled?: boolean;
  initialData?: WorkplaceShiftFormBootstrapData;
}) {
  const {
    enabled = true,
    initialData,
    selectedWorkplaceId = null,
    userId,
  } = input;

  return useQuery({
    queryKey: queryKeys.workplaces.shiftFormBootstrap({
      userId,
      selectedWorkplaceId,
    }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (selectedWorkplaceId) {
        params.set("selectedWorkplaceId", selectedWorkplaceId);
      }

      const queryString = params.toString();
      const path = queryString
        ? `/api/shifts/form-bootstrap?${queryString}`
        : "/api/shifts/form-bootstrap";

      return fetchJson(path, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "シフト入力の参照データ取得に失敗しました。",
        parse: parseWorkplaceShiftFormBootstrapPayload,
      });
    },
    enabled,
    initialData,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
