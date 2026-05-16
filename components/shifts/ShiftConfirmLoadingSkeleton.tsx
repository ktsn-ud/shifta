import { SpinnerPanel } from "@/components/ui/spinner";

export function ShiftConfirmPageLoadingSkeleton() {
  return (
    <section className="flex flex-col gap-6 p-4 md:h-[calc(100svh-var(--header-height))] md:overflow-hidden md:p-6">
      <header className="space-y-2 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Shift Confirm
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">シフト確定</h2>
        <p className="text-sm text-muted-foreground">
          未確定シフトの時刻調整と確定を行えます。
        </p>
      </header>

      <SpinnerPanel
        className="min-h-[360px]"
        label="シフト確定情報を読み込み中..."
      />
    </section>
  );
}
