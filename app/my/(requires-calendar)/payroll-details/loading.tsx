import { SpinnerPanel } from "@/components/ui/spinner";

export default function PayrollDetailsLoading() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">給与詳細</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          給与の内訳と計算根拠を読み込み中です。
        </p>
      </header>
      <SpinnerPanel className="min-h-[320px]" label="給与詳細を読み込み中..." />
    </section>
  );
}
