import { useQuery } from "@tanstack/react-query";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";
import {
  unconfirmedShiftCountResponseSchema,
  unconfirmedShiftsResponseSchema,
} from "@/lib/query/dto-schemas/shift-confirmation";

const dateWithWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "UTC",
});

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateWithWeekday(dateOnly: string): string {
  return dateWithWeekdayFormatter.format(parseDateOnly(dateOnly));
}

function parseUnconfirmedPayload(payload: unknown): UnconfirmedShiftItem[] {
  const result = unconfirmedShiftsResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error("UNCONFIRMED_SHIFTS_RESPONSE_INVALID");
  }
  const { shifts } = result.data;

  return shifts.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: formatDateWithWeekday(shift.date),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
    transportationAllowance: shift.transportationAllowance,
  }));
}

function parseUnconfirmedShiftCountPayload(payload: unknown): number {
  const result = unconfirmedShiftCountResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error("UNCONFIRMED_SHIFT_COUNT_RESPONSE_INVALID");
  }

  return result.data.count;
}

export function useUnconfirmedShiftsQuery(input: {
  userId: string;
  initialDataVersion: string;
  initialData?: UnconfirmedShiftItem[];
}) {
  const { initialData, initialDataVersion, userId } = input;

  return useQuery({
    queryKey: queryKeys.shifts.unconfirmed({ userId, initialDataVersion }),
    queryFn: ({ signal }) =>
      fetchJson("/api/shifts/unconfirmed", {
        init: { signal, cache: "no-store" },
        fallbackMessage: "未確定シフトの取得に失敗しました。",
        parse: parseUnconfirmedPayload,
      }),
    initialData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useUnconfirmedShiftCountQuery(input: {
  userId: string;
  initialDataVersion: string;
  initialData: number;
}) {
  const { initialData, initialDataVersion, userId } = input;

  return useQuery({
    queryKey: queryKeys.shifts.unconfirmedCount({
      userId,
      initialDataVersion,
    }),
    queryFn: ({ signal }) =>
      fetchJson("/api/shifts/unconfirmed/count", {
        init: { signal, cache: "no-store" },
        fallbackMessage: "未確定シフト件数の取得に失敗しました。",
        parse: parseUnconfirmedShiftCountPayload,
      }),
    initialData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
