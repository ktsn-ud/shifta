"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  endOfMonth,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";

type MonthShift = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON" | "OTHER";
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
  data: MonthShift[];
};

type UseMonthShiftsOptions = {
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

export function useMonthShifts(
  month: Date,
  options: UseMonthShiftsOptions = {},
) {
  const { initialShifts, initialStartDate, initialEndDate } = options;
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

  const reload = useCallback(() => {
    setReloadCount((current) => current + 1);
  }, []);

  useEffect(() => {
    const canUseInitialData =
      reloadCount === 0 &&
      hasInitialData &&
      initialStartDate === startDate &&
      initialEndDate === endDate;

    if (canUseInitialData) {
      setErrorMessage(null);
      setShifts(initialShifts ?? []);
      setIsLoading(false);
      return;
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
          cache: "no-store",
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

        setShifts(payload.data);
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
