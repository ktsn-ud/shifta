import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">時間割作成</h2>
        <p className="text-sm text-muted-foreground">
          授業コマ設定を行います。
        </p>
      </header>

      <FormLoadingSkeleton />
    </section>
  );
}
