import { Button } from "@/components/ui/button";
import { SpinnerPanel } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Payroll Rules
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">給与ルール</h2>
          <p className="text-sm text-muted-foreground">
            勤務先ごとの給与ルールを管理します。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled>
            勤務先一覧へ
          </Button>
          <Button type="button" disabled>
            新規ルール追加
          </Button>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[320px]"
        label="給与ルールを読み込み中..."
      />
    </section>
  );
}
