import { SpinnerPanel } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">
          Shifta カレンダーを設定しましょう
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Google Calendar と同期するための準備を行います。
        </p>
      </header>
      <SpinnerPanel className="min-h-[280px]" label="設定情報を読み込み中..." />
    </section>
  );
}
