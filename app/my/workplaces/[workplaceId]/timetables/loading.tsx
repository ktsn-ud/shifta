import { SpinnerPanel } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <div>
          <h2 className="text-xl font-semibold">時間割</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            勤務先ごとの塾時間割を管理します。
          </p>
        </div>
      </header>
      <SpinnerPanel className="min-h-[320px]" label="時間割を読み込み中..." />
    </section>
  );
}
