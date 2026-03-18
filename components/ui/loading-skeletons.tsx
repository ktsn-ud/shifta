import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TableLoadingSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

type StatCardsLoadingSkeletonProps = {
  count?: number;
  className?: string;
};

function FormLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}

function TableLoadingSkeleton({
  rows = 4,
  columns = 3,
  className,
}: TableLoadingSkeletonProps) {
  const widths = ["w-full", "w-5/6", "w-4/6", "w-3/6"] as const;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`table-row-${rowIndex}`}
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={`table-cell-${rowIndex}-${columnIndex}`}
              className={cn(
                "h-4",
                widths[(rowIndex + columnIndex) % widths.length],
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarLoadingSkeleton() {
  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between border-b px-3 py-2 md:px-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-20" />
      </header>

      <div className="grid grid-cols-7 border-b bg-muted/30 px-1 py-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={`calendar-weekday-${index}`} className="px-2">
            <Skeleton className="mx-auto h-3 w-8" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px p-px">
        {Array.from({ length: 42 }).map((_, index) => (
          <div key={`calendar-cell-${index}`} className="rounded-md border p-2">
            <Skeleton className="h-4 w-5" />
            <div className="mt-3 flex gap-1">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="size-2 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatCardsLoadingSkeleton({
  count = 3,
  className,
}: StatCardsLoadingSkeletonProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={`stat-card-${index}`} className="rounded-xl border p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
          <Skeleton className="mt-6 h-8 w-32" />
        </div>
      ))}
    </div>
  );
}

export {
  CalendarLoadingSkeleton,
  FormLoadingSkeleton,
  StatCardsLoadingSkeleton,
  TableLoadingSkeleton,
};
