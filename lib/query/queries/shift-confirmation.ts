import { useQuery } from "@tanstack/react-query";
import { type ConfirmedShiftWorkplaceGroup } from "@/components/shifts/shift-confirmation-types";
import { type UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";

type UnconfirmedShiftApiResponse = {
  shifts: Array<{
    id: string;
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

type ConfirmedShiftApiResponse = {
  shifts: Array<{
    id: string;
    comment: string | null;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    workDurationHours: number;
    wage: number | null;
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
    date: formatDateWithWeekday(shift.date),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
  }));
}

function parseConfirmedPayload(
  payload: unknown,
): ConfirmedShiftWorkplaceGroup[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as ConfirmedShiftApiResponse).shifts)
  ) {
    throw new Error("CONFIRMED_SHIFTS_RESPONSE_INVALID");
  }

  const grouped = new Map<string, ConfirmedShiftWorkplaceGroup>();

  for (const shift of (payload as ConfirmedShiftApiResponse).shifts) {
    const existing = grouped.get(shift.workplace.id);
    if (existing) {
      existing.shifts.push({
        id: shift.id,
        date: formatDateWithWeekday(shift.date),
        comment: shift.comment,
        startTime: shift.startTime,
        endTime: shift.endTime,
        workDurationHours: shift.workDurationHours,
        wage: shift.wage,
      });
      continue;
    }

    grouped.set(shift.workplace.id, {
      workplaceId: shift.workplace.id,
      workplaceName: shift.workplace.name,
      workplaceColor: shift.workplace.color,
      shifts: [
        {
          id: shift.id,
          date: formatDateWithWeekday(shift.date),
          comment: shift.comment,
          startTime: shift.startTime,
          endTime: shift.endTime,
          workDurationHours: shift.workDurationHours,
          wage: shift.wage,
        },
      ],
    });
  }

  return Array.from(grouped.values());
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
  });
}

export function useConfirmedCurrentMonthShiftsQuery(input: {
  userId: string;
  initialData?: ConfirmedShiftWorkplaceGroup[];
}) {
  const { initialData, userId } = input;

  return useQuery({
    queryKey: queryKeys.shifts.confirmedCurrentMonth({ userId }),
    queryFn: ({ signal }) =>
      fetchJson("/api/shifts/confirmed-current-month", {
        init: { signal, cache: "no-store" },
        fallbackMessage: "確定済みシフトの取得に失敗しました。",
        parse: parseConfirmedPayload,
      }),
    initialData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
