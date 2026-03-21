import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </header>

      <FormLoadingSkeleton />
    </section>
  );
}
