"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dateFromDateKey,
  dateKeyFromApiDate,
  endOfMonth,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import { fetchJson } from "@/lib/query/fetch-json";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";
import { toUserFacingMessage } from "@/lib/user-facing-error";

type MonthShift = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON";
  comment: string | null;
  googleSyncStatus: "PENDING" | "SUCCESS" | "FAILED";
  googleSyncError: string | null;
  googleSyncedAt: string | null;
  workedMinutes: number;
  estimatedPay: number | null;
  workplace: {
    id: string;
    name: string;
    color: string;
    type: "GENERAL" | "CRAM_SCHOOL";
  };
  lessonRange: {
    id: string;
    shiftId: string;
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

type ShiftSummary = {
  totalWorkedMinutes: number;
  totalEstimatedPay: number;
  shiftCount: number;
};

type ShiftListResponse = {
  data: unknown[];
};

type MonthShiftLikePayload = Partial<MonthShift> & {
  shiftType?: string;
  lessonRange?: {
    id?: string;
    shiftId?: string;
    timetableSetId?: string;
    startPeriod?: number;
    endPeriod?: number;
  } | null;
};

type UseMonthShiftsOptions = {
  cacheUserKey: string;
  initialShifts?: MonthShift[];
  initialStartDate?: string;
  initialEndDate?: string;
  deferEstimate?: boolean;
};

const MONTH_SHIFTS_STALE_TIME_MS = 60 * 1000;
const MONTH_SHIFTS_GC_TIME_MS = 10 * 60 * 1000;

function isShiftListResponse(value: unknown): value is ShiftListResponse {
  if (typeof value === "object" && value !== null) {
    return "data" in value;
  }

  return false;
}

function normalizeLessonRange(
  lessonRange: MonthShiftLikePayload["lessonRange"],
): MonthShift["lessonRange"] {
  if (
    lessonRange &&
    typeof lessonRange.id === "string" &&
    typeof lessonRange.shiftId === "string" &&
    typeof lessonRange.startPeriod === "number" &&
    typeof lessonRange.endPeriod === "number"
  ) {
    return {
      id: lessonRange.id,
      shiftId: lessonRange.shiftId,
      timetableSetId: lessonRange.timetableSetId ?? "",
      startPeriod: lessonRange.startPeriod,
      endPeriod: lessonRange.endPeriod,
    };
  }

  return null;
}

function resolveWorkedMinutes(shift: MonthShiftLikePayload): number | null {
  if (typeof shift.workedMinutes === "number") {
    return shift.workedMinutes;
  }

  if (
    typeof shift.date !== "string" ||
    typeof shift.startTime !== "string" ||
    typeof shift.endTime !== "string" ||
    typeof shift.breakMinutes !== "number"
  ) {
    return null;
  }

  const shiftType = shift.shiftType === "LESSON" ? "LESSON" : "NORMAL";
  const lessonRange = normalizeLessonRange(shift.lessonRange);

  return calculateWorkedMinutes({
    date: new Date(shift.date),
    startTime: new Date(shift.startTime),
    endTime: new Date(shift.endTime),
    breakMinutes: shift.breakMinutes,
    shiftType,
    lessonRange:
      lessonRange === null
        ? null
        : {
            timetableSetId: lessonRange.timetableSetId,
            startPeriod: lessonRange.startPeriod,
            endPeriod: lessonRange.endPeriod,
          },
  });
}

function normalizeMonthShift(raw: unknown): MonthShift | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const shift = raw as MonthShiftLikePayload;
  const workedMinutes = resolveWorkedMinutes(shift);

  if (
    typeof shift.id !== "string" ||
    typeof shift.workplaceId !== "string" ||
    typeof shift.date !== "string" ||
    typeof shift.startTime !== "string" ||
    typeof shift.endTime !== "string" ||
    typeof shift.breakMinutes !== "number" ||
    workedMinutes === null ||
    !shift.workplace ||
    typeof shift.workplace.id !== "string" ||
    typeof shift.workplace.name !== "string" ||
    typeof shift.workplace.color !== "string" ||
    (shift.workplace.type !== "GENERAL" &&
      shift.workplace.type !== "CRAM_SCHOOL")
  ) {
    return null;
  }

  return {
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
    shiftType: shift.shiftType === "LESSON" ? "LESSON" : "NORMAL",
    comment:
      typeof shift.comment === "string" || shift.comment === null
        ? shift.comment
        : null,
    googleSyncStatus:
      shift.googleSyncStatus === "SUCCESS" ||
      shift.googleSyncStatus === "FAILED"
        ? shift.googleSyncStatus
        : "PENDING",
    googleSyncError: shift.googleSyncError ?? null,
    googleSyncedAt: shift.googleSyncedAt ?? null,
    workedMinutes,
    estimatedPay:
      typeof shift.estimatedPay === "number" ? shift.estimatedPay : null,
    workplace: {
      id: shift.workplace.id,
      name: shift.workplace.name,
      color: shift.workplace.color,
      type: shift.workplace.type,
    },
    lessonRange: normalizeLessonRange(shift.lessonRange),
  };
}

function parseMonthShiftsPayload(payload: unknown): MonthShift[] {
  const isValidPayload =
    isShiftListResponse(payload) && Array.isArray(payload.data);

  if (isValidPayload === false) {
    throw new Error("SHIFT_RESPONSE_INVALID");
  }

  return payload.data
    .map((shift) => normalizeMonthShift(shift))
    .filter((shift): shift is MonthShift => shift !== null);
}

async function fetchMonthShifts(params: {
  startDate: string;
  endDate: string;
  includeEstimate: boolean;
  signal?: AbortSignal;
}): Promise<MonthShift[]> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    includeEstimate: params.includeEstimate ? "true" : "false",
  });

  return fetchJson(`/api/shifts?${query.toString()}`, {
    init: {
      signal: params.signal,
    },
    fallbackMessage: "シフト一覧の取得に失敗しました。",
    parse: parseMonthShiftsPayload,
  });
}

export function clearMonthShiftsCache(): void {
  const queryClient = getBrowserQueryClient();
  queryClient.removeQueries({
    queryKey: ["shifts", "month"],
  });
}

export function summarizeShifts(shifts: MonthShift[]): ShiftSummary {
  return shifts.reduce<ShiftSummary>(
    (summary, shift) => {
      const estimatedPay = shift.estimatedPay ?? 0;
      return {
        totalWorkedMinutes: summary.totalWorkedMinutes + shift.workedMinutes,
        totalEstimatedPay: summary.totalEstimatedPay + estimatedPay,
        shiftCount: summary.shiftCount + 1,
      };
    },
    {
      totalWorkedMinutes: 0,
      totalEstimatedPay: 0,
      shiftCount: 0,
    },
  );
}

export function useMonthShifts(month: Date, options: UseMonthShiftsOptions) {
  const {
    cacheUserKey,
    initialShifts,
    initialStartDate,
    initialEndDate,
    deferEstimate = false,
  } = options;
  const queryClient = useQueryClient();

  const startDate = useMemo(
    () => toDateOnlyString(startOfMonth(month)),
    [month],
  );
  const endDate = useMemo(() => toDateOnlyString(endOfMonth(month)), [month]);

  const hasInitialData =
    Array.isArray(initialShifts) &&
    typeof initialStartDate === "string" &&
    typeof initialEndDate === "string" &&
    initialStartDate === startDate &&
    initialEndDate === endDate;

  const primaryIncludeEstimate = deferEstimate === false;

  const primaryQueryKey = queryKeys.shifts.month({
    userId: cacheUserKey,
    startDate,
    endDate,
    includeEstimate: primaryIncludeEstimate,
  });
  const estimatedQueryKey = queryKeys.shifts.month({
    userId: cacheUserKey,
    startDate,
    endDate,
    includeEstimate: true,
  });

  const {
    data: monthShiftsData,
    error: monthShiftsError,
    isLoading: isMonthShiftsLoading,
    isFetching: isMonthShiftsFetching,
    isPlaceholderData,
  } = useQuery({
    queryKey: primaryQueryKey,
    queryFn: ({ signal }) =>
      fetchMonthShifts({
        startDate,
        endDate,
        includeEstimate: primaryIncludeEstimate,
        signal,
      }),
    initialData: hasInitialData ? (initialShifts ?? []) : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: MONTH_SHIFTS_STALE_TIME_MS,
    gcTime: MONTH_SHIFTS_GC_TIME_MS,
  });

  const {
    data: estimatedMonthShiftsData,
    isFetching: isEstimatedMonthShiftsFetching,
  } = useQuery({
    queryKey: estimatedQueryKey,
    queryFn: ({ signal }) =>
      fetchMonthShifts({
        startDate,
        endDate,
        includeEstimate: true,
        signal,
      }).catch((error: unknown) => {
        console.error("useMonthShifts estimate fetch failed", error);
        throw error;
      }),
    enabled: deferEstimate,
    placeholderData: (previousData) => previousData,
    staleTime: MONTH_SHIFTS_STALE_TIME_MS,
    gcTime: MONTH_SHIFTS_GC_TIME_MS,
  });

  const shifts = useMemo(() => {
    const baseShifts = monthShiftsData ?? [];

    if (!deferEstimate) {
      return baseShifts;
    }

    const estimatedShifts = estimatedMonthShiftsData;
    if (!estimatedShifts) {
      return baseShifts;
    }

    const estimatedPayByShiftId = new Map(
      estimatedShifts.map((shift) => [shift.id, shift.estimatedPay]),
    );

    return baseShifts.map((shift) => {
      const estimatedPay = estimatedPayByShiftId.get(shift.id);

      if (estimatedPay === undefined || shift.estimatedPay === estimatedPay) {
        return shift;
      }

      return {
        ...shift,
        estimatedPay,
      };
    });
  }, [deferEstimate, estimatedMonthShiftsData, monthShiftsData]);

  const displayMonth = useMemo(() => {
    const firstShiftDate = shifts[0]?.date;
    if (!firstShiftDate) {
      return month;
    }

    return startOfMonth(
      dateFromDateKey(dateKeyFromApiDate(firstShiftDate)) ?? month,
    );
  }, [month, shifts]);

  const errorMessage = monthShiftsError
    ? toUserFacingMessage(monthShiftsError, "シフト一覧の取得に失敗しました。")
    : null;
  const hasShiftData = monthShiftsData !== undefined;
  const isInitialLoading = isMonthShiftsLoading && !hasShiftData;
  const isRefreshing =
    hasShiftData &&
    (isMonthShiftsFetching ||
      (deferEstimate && isEstimatedMonthShiftsFetching));

  async function reload() {
    await queryClient.invalidateQueries({
      queryKey: primaryQueryKey,
    });

    if (deferEstimate) {
      await queryClient.invalidateQueries({
        queryKey: estimatedQueryKey,
      });
    }
  }

  return {
    shifts,
    displayMonth,
    isLoading: isInitialLoading,
    isInitialLoading,
    isRefreshing,
    isPlaceholderData,
    errorMessage,
    reload,
  };
}

export { normalizeMonthShift };
export type { MonthShift, ShiftSummary };
