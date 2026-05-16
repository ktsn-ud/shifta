import { SpinnerPanel } from "@/components/ui/spinner";

export function BulkShiftPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 pb-32 md:p-6 md:pb-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">シフト一括登録</h2>
        <p className="text-sm text-muted-foreground">
          勤務先と日付を選び、複数日のシフトをまとめて登録します。
        </p>
      </header>
      <SpinnerPanel
        className="min-h-[360px]"
        label="シフト一括登録画面を読み込み中..."
      />
    </section>
  );
}
