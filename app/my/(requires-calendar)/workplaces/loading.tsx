import { Button } from "@/components/ui/button";
import { SpinnerPanel } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Workplace
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">勤務先管理</h2>
          <p className="text-sm text-muted-foreground">
            勤務先の作成・編集・削除を行います。
          </p>
        </div>
        <Button type="button" disabled>
          新規追加
        </Button>
      </header>
      <SpinnerPanel
        className="min-h-[320px]"
        label="勤務先一覧を読み込み中..."
      />
    </section>
  );
}
