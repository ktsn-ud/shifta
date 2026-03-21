import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export function NewShiftFormLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">シフト入力</h2>
        <p className="text-sm text-muted-foreground">
          新しいシフトを登録します。登録後はカレンダー画面へ戻ります。
        </p>
      </header>

      <div className="flex max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full max-w-50" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-10 w-40" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-10 w-full max-w-30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>

        <Skeleton className="h-10 w-24" />
      </div>
    </section>
  );
}

export function EditShiftFormLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">シフト編集</h2>
        <p className="text-sm text-muted-foreground">
          既存シフトを更新します。更新後はカレンダー画面へ戻ります。
        </p>
      </header>
      <FormLoadingSkeleton />
    </section>
  );
}
