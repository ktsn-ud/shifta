import { SpinnerPanel } from "@/components/ui/spinner";

export function ShiftConfirmPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">シフト確定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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
