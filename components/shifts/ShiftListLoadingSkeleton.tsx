import { Button } from "@/components/ui/button";
import { SpinnerPanel } from "@/components/ui/spinner";

export function ShiftListPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Shift List
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">シフト一覧</h2>
          <p className="text-sm text-muted-foreground">
            月ごとのシフトを確認し、並び替え・一括削除できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled>
            前月
          </Button>
          <Button type="button" variant="outline" disabled>
            今月
          </Button>
          <Button type="button" variant="outline" disabled>
            次月
          </Button>
          <Button type="button" disabled>
            新規シフト登録
          </Button>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[360px]"
        label="シフト一覧を読み込み中..."
      />
    </section>
  );
}
