import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">勤務先作成</h2>
        <p className="text-sm text-muted-foreground">
          勤務先名・タイプ・表示色を設定します。
        </p>
      </header>

      <div className="flex max-w-md flex-col gap-6">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-10 w-full max-w-50" />
            <Skeleton className="h-3 w-40" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-12" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-9 w-48" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-8" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-10 w-full max-w-50" />
            </div>
            <Skeleton className="h-3 w-36" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    </section>
  );
}
