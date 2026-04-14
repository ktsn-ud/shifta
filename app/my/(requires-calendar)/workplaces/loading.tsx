import { SpinnerPanel } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <div>
          <h2 className="text-xl font-semibold">勤務先管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            勤務先の作成・編集・削除を行います。
          </p>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[320px]"
        label="勤務先一覧を読み込み中..."
      />
    </section>
  );
}
