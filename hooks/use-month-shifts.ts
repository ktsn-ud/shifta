"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  endOfMonth,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";

const MONTH_SHIFTS_CACHE_TTL_MS = 5 * 60 * 1000;

type MonthShiftsCacheEntry = {
  expiresAt: number;
  shifts: MonthShift[];
};

const monthShiftsCache = new Map<string, MonthShiftsCacheEntry>();

type MonthShift = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON";
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

type UseMonthShiftsOptions = {
  cacheUserKey: string;
  initialShifts?: MonthShift[];
  initialStartDate?: string;
  initialEndDate?: string;
};

function isShiftListResponse(value: unknown): value is ShiftListResponse {
  if (typeof value === "object" && value !== null) {
    return "data" in value;
  }

  return false;
}

function toMonthShiftsCacheKey(
  userKey: string,
  startDate: string,
  endDate: string,
): string {
  return `${userKey}:${startDate}:${endDate}`;
}

function readMonthShiftsCache(
  cacheKey: string,
  now: number = Date.now(),
): MonthShift[] | null {
  const cached = monthShiftsCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    monthShiftsCache.delete(cacheKey);
    return null;
  }

  return cached.shifts;
}

function writeMonthShiftsCache(cacheKey: string, shifts: MonthShift[]): void {
  monthShiftsCache.set(cacheKey, {
    shifts,
    expiresAt: Date.now() + MONTH_SHIFTS_CACHE_TTL_MS,
  });
}

function normalizeMonthShift(raw: unknown): MonthShift | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const shift = raw as Partial<MonthShift> & {
    shiftType?: string;
    lessonRange?: {
      id?: string;
      shiftId?: string;
      timetableSetId?: string;
      startPeriod?: number;
      endPeriod?: number;
    } | null;
  };

  if (
    typeof shift.id !== "string" ||
    typeof shift.workplaceId !== "string" ||
    typeof shift.date !== "string" ||
    typeof shift.startTime !== "string" ||
    typeof shift.endTime !== "string" ||
    typeof shift.breakMinutes !== "number" ||
    typeof shift.googleSyncStatus !== "string" ||
    typeof shift.workedMinutes !== "number" ||
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
    googleSyncStatus:
      shift.googleSyncStatus === "SUCCESS" ||
      shift.googleSyncStatus === "FAILED"
        ? shift.googleSyncStatus
        : "PENDING",
    googleSyncError: shift.googleSyncError ?? null,
    googleSyncedAt: shift.googleSyncedAt ?? null,
    workedMinutes: shift.workedMinutes,
    estimatedPay:
      typeof shift.estimatedPay === "number" ? shift.estimatedPay : null,
    workplace: {
      id: shift.workplace.id,
      name: shift.workplace.name,
      color: shift.workplace.color,
      type: shift.workplace.type,
    },
    lessonRange:
      shift.lessonRange &&
      typeof shift.lessonRange.id === "string" &&
      typeof shift.lessonRange.shiftId === "string" &&
      typeof shift.lessonRange.startPeriod === "number" &&
      typeof shift.lessonRange.endPeriod === "number"
        ? {
            id: shift.lessonRange.id,
            shiftId: shift.lessonRange.shiftId,
            timetableSetId: shift.lessonRange.timetableSetId ?? "",
            startPeriod: shift.lessonRange.startPeriod,
            endPeriod: shift.lessonRange.endPeriod,
          }
        : null,
  };
}

export function clearMonthShiftsCache(): void {
  monthShiftsCache.clear();
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
  const { cacheUserKey, initialShifts, initialStartDate, initialEndDate } =
    options;
  const hasInitialData =
    Array.isArray(initialShifts) &&
    typeof initialStartDate === "string" &&
    typeof initialEndDate === "string";

  const [shifts, setShifts] = useState<MonthShift[]>(() => initialShifts ?? []);
  const [isLoading, setIsLoading] = useState(() => !hasInitialData);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const startDate = useMemo(
    () => toDateOnlyString(startOfMonth(month)),
    [month],
  );
  const endDate = useMemo(() => toDateOnlyString(endOfMonth(month)), [month]);
  const cacheKey = useMemo(
    () => toMonthShiftsCacheKey(cacheUserKey, startDate, endDate),
    [cacheUserKey, endDate, startDate],
  );

  const reload = useCallback(() => {
    monthShiftsCache.delete(cacheKey);
    setReloadCount((current) => current + 1);
  }, [cacheKey]);

  useEffect(() => {
    const canUseInitialData =
      reloadCount === 0 &&
      hasInitialData &&
      initialStartDate === startDate &&
      initialEndDate === endDate;

    if (canUseInitialData) {
      writeMonthShiftsCache(cacheKey, initialShifts ?? []);
      setErrorMessage(null);
      setShifts(initialShifts ?? []);
      setIsLoading(false);
      return;
    }

    if (reloadCount === 0) {
      const cachedShifts = readMonthShiftsCache(cacheKey);
      if (cachedShifts) {
        setErrorMessage(null);
        setShifts(cachedShifts);
        setIsLoading(false);
        return;
      }
    }

    const abortController = new AbortController();

    async function fetchMonthShifts() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
          includeEstimate: "true",
        });

        const response = await fetch(`/api/shifts?${params.toString()}`, {
          signal: abortController.signal,
        });

        if (response.ok === false) {
          throw new Error("SHIFT_FETCH_FAILED");
        }

        const payload = (await response.json()) as unknown;
        const isValidPayload =
          isShiftListResponse(payload) && Array.isArray(payload.data);

        if (isValidPayload === false) {
          throw new Error("SHIFT_RESPONSE_INVALID");
        }

        const normalized = payload.data
          .map((shift) => normalizeMonthShift(shift))
          .filter((shift): shift is MonthShift => shift !== null);

        setShifts(normalized);
        writeMonthShiftsCache(cacheKey, normalized);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("useMonthShifts failed", error);
        setShifts([]);
        setErrorMessage("シフト一覧の取得に失敗しました");
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchMonthShifts();

    return () => {
      abortController.abort();
    };
  }, [
    endDate,
    hasInitialData,
    cacheKey,
    initialEndDate,
    initialShifts,
    initialStartDate,
    reloadCount,
    startDate,
  ]);

  return {
    shifts,
    isLoading,
    errorMessage,
    reload,
  };
}

export type { MonthShift, ShiftSummary };
