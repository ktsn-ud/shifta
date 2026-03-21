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

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, blockIndex) => (
          <div
            key={`my-loading-panel-${blockIndex}`}
            className="rounded-xl border p-4"
          >
            <Skeleton className="h-6 w-36" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <Skeleton
                  key={`my-loading-panel-${blockIndex}-row-${rowIndex}`}
                  className="h-4 w-full"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`my-loading-list-${index}`}
              className="h-14 w-full"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
