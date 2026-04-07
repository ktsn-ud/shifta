import { SpinnerPanel } from "@/components/ui/spinner";

export function ShiftListPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <div>
          <h2 className="text-xl font-semibold">シフト一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            月ごとのシフトを確認し、並び替え・一括削除できます。
          </p>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[360px]"
        label="シフト一覧を読み込み中..."
      />
    </section>
  );
}
