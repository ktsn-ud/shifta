import { useQuery } from "@tanstack/react-query";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";

type UnconfirmedShiftApiResponse = {
  shifts: Array<{
    id: string;
    workplaceId: string;
    comment: string | null;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    isConfirmed: boolean;
    workplace: {
      id: string;
      name: string;
      color: string;
    };
  }>;
};

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
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as UnconfirmedShiftApiResponse).shifts)
  ) {
    throw new Error("UNCONFIRMED_SHIFTS_RESPONSE_INVALID");
  }

  return (payload as UnconfirmedShiftApiResponse).shifts.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: formatDateWithWeekday(shift.date),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
  }));
}

export function useUnconfirmedShiftsQuery(input: {
  userId: string;
  initialData?: UnconfirmedShiftItem[];
}) {
  const { initialData, userId } = input;

  return useQuery({
    queryKey: queryKeys.shifts.unconfirmed({ userId }),
    queryFn: ({ signal }) =>
      fetchJson("/api/shifts/unconfirmed", {
        init: { signal, cache: "no-store" },
        fallbackMessage: "未確定シフトの取得に失敗しました。",
        parse: parseUnconfirmedPayload,
      }),
    initialData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
