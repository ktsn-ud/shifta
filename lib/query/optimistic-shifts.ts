import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { MonthShift } from "@/hooks/use-month-shifts";

type ShiftLike = {
  id: string;
  date?: string;
  startTime?: string;
};

type MonthShiftQueryInput = {
  userId: string;
  startDate: string;
  endDate: string;
  includeEstimate: boolean;
};

type QuerySnapshot = {
  key: QueryKey;
  data: ShiftLike[] | undefined;
};

function isMonthShiftQueryInput(value: unknown): value is MonthShiftQueryInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    typeof (value as MonthShiftQueryInput).userId === "string" &&
    typeof (value as MonthShiftQueryInput).startDate === "string" &&
    typeof (value as MonthShiftQueryInput).endDate === "string" &&
    typeof (value as MonthShiftQueryInput).includeEstimate === "boolean"
  );
}

function readMonthShiftQueryInput(key: QueryKey): MonthShiftQueryInput | null {
  const [, scope, input] = key;
  if (scope !== "month" || !isMonthShiftQueryInput(input)) {
    return null;
  }

  return input;
}

function compareMonthShiftRows(left: ShiftLike, right: ShiftLike): number {
  const leftDate = left.date ?? "";
  const rightDate = right.date ?? "";
  const dateCompare = leftDate.localeCompare(rightDate);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const leftStartTime = left.startTime ?? "";
  const rightStartTime = right.startTime ?? "";
  const timeCompare = leftStartTime.localeCompare(rightStartTime);
  if (timeCompare !== 0) {
    return timeCompare;
  }

  return left.id.localeCompare(right.id);
}

function snapshotMonthShiftQueries(queryClient: QueryClient): QuerySnapshot[] {
  return queryClient
    .getQueriesData<ShiftLike[]>({
      queryKey: ["shifts", "month"],
    })
    .map(([key, data]) => ({ key, data }));
}

function restoreMonthShiftQueries(
  queryClient: QueryClient,
  snapshots: QuerySnapshot[],
): void {
  for (const snapshot of snapshots) {
    queryClient.setQueryData(snapshot.key, snapshot.data);
  }
}

function isDateIncluded(input: MonthShiftQueryInput, date: string): boolean {
  return input.startDate <= date && date <= input.endDate;
}

function getMonthShiftQueryEntries(queryClient: QueryClient): Array<{
  key: QueryKey;
  data: MonthShift[] | undefined;
}> {
  return queryClient
    .getQueriesData<MonthShift[]>({
      queryKey: ["shifts", "month"],
    })
    .map(([key, data]) => ({ key, data }));
}

export function removeShiftsFromMonthCachesOptimistically(
  queryClient: QueryClient,
  shiftIds: string[],
): () => void {
  const targets = new Set(shiftIds);
  const snapshots = snapshotMonthShiftQueries(queryClient);

  for (const { key, data } of getMonthShiftQueryEntries(queryClient)) {
    if (!Array.isArray(data)) {
      continue;
    }

    queryClient.setQueryData<MonthShift[]>(
      key,
      data.filter((shift) => !targets.has(shift.id)),
    );
  }

  return () => {
    restoreMonthShiftQueries(queryClient, snapshots);
  };
}

export function upsertMonthShiftInCachesOptimistically(
  queryClient: QueryClient,
  shift: MonthShift,
  options?: {
    previousShiftId?: string;
  },
): void {
  const targetId = options?.previousShiftId ?? shift.id;

  for (const { key, data } of getMonthShiftQueryEntries(queryClient)) {
    if (!Array.isArray(data)) {
      continue;
    }

    const input = readMonthShiftQueryInput(key);
    const next = data.filter((row) => row.id !== targetId);

    if (!input || !isDateIncluded(input, shift.date)) {
      queryClient.setQueryData<MonthShift[]>(key, next);
      continue;
    }

    queryClient.setQueryData<MonthShift[]>(
      key,
      [...next, shift].toSorted(compareMonthShiftRows),
    );
  }
}

export function updateShiftInMonthCachesOptimistically(
  queryClient: QueryClient,
  shiftId: string,
  updater: (shift: MonthShift) => MonthShift,
): void {
  for (const { key, data } of getMonthShiftQueryEntries(queryClient)) {
    if (!Array.isArray(data)) {
      continue;
    }

    queryClient.setQueryData<MonthShift[]>(
      key,
      data
        .map((shift) => (shift.id === shiftId ? updater(shift) : shift))
        .toSorted(compareMonthShiftRows),
    );
  }
}
