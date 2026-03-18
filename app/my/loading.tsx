import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`my-loading-card-${index}`}
            className="rounded-xl border p-5"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-3 w-44" />
            <Skeleton className="mt-6 h-8 w-32" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-10 w-full" />
        <div className="mt-4 grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, index) => (
            <Skeleton
              key={`my-loading-grid-${index}`}
              className="h-20 w-full"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
