import { Skeleton } from "@/components/ui/skeleton";

type UnconfirmedShiftCardsSkeletonProps = {
  count?: number;
};

type ConfirmedShiftTableSkeletonProps = {
  rows?: number;
};

function UnconfirmedShiftCardsSkeleton({
  count = 3,
}: UnconfirmedShiftCardsSkeletonProps) {
  return (
    <div className="p-1">
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={`unconfirmed-shift-card-skeleton-${index}`}
            className="w-full rounded-xl border p-4 shadow-none md:max-w-2xl"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-28" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex items-end lg:justify-end">
                <Skeleton className="h-9 w-full lg:w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmedShiftTableSkeleton({
  rows = 3,
}: ConfirmedShiftTableSkeletonProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-2xl rounded-xl border p-4">
        <Skeleton className="h-6 w-32" />

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>

          {Array.from({ length: rows }).map((_, index) => (
            <div
              key={`confirmed-shift-row-skeleton-${index}`}
              className="grid grid-cols-3 gap-3"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShiftConfirmPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>

      <section className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <UnconfirmedShiftCardsSkeleton />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-44" />
        <ConfirmedShiftTableSkeleton />
      </section>
    </section>
  );
}

export { ConfirmedShiftTableSkeleton, UnconfirmedShiftCardsSkeleton };
