import { CalendarLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export function BulkShiftPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-80" />
      </header>

      <section className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-6 w-28" />
        <div className="flex max-w-md flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-48" />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-6 w-32" />
        <CalendarLoadingSkeleton />
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-6 w-36" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full max-w-64" />
          <Skeleton className="h-10 w-full max-w-64" />
          <Skeleton className="h-10 w-full max-w-64" />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-24 w-full" />
      </section>
    </section>
  );
}
