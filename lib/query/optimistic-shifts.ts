import { type QueryClient, type QueryKey } from "@tanstack/react-query";

type ShiftLike = {
  id: string;
};

type QuerySnapshot = {
  key: QueryKey;
  data: ShiftLike[] | undefined;
};

export function removeShiftsFromMonthCachesOptimistically(
  queryClient: QueryClient,
  shiftIds: string[],
): () => void {
  const targets = new Set(shiftIds);
  const snapshots: QuerySnapshot[] = queryClient
    .getQueriesData<ShiftLike[]>({
      queryKey: ["shifts", "month"],
    })
    .map(([key, data]) => ({ key, data }));

  queryClient.setQueriesData<ShiftLike[]>(
    { queryKey: ["shifts", "month"] },
    (current) => {
      if (!Array.isArray(current)) {
        return current;
      }

      return current.filter((shift) => !targets.has(shift.id));
    },
  );

  return () => {
    for (const snapshot of snapshots) {
      queryClient.setQueryData(snapshot.key, snapshot.data);
    }
  };
}
