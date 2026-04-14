import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">給与ルール編集</h2>
        <p className="text-sm text-muted-foreground">
          勤務先ごとの給与ルールを設定します。
        </p>
      </header>

      <FormLoadingSkeleton />
    </section>
  );
}
