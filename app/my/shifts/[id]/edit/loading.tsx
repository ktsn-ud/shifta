import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function Loading() {
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
