import { PayrollDetailsViewSwitch } from "@/components/payroll-details/payroll-details-view-switch";

export default function PayrollDetailsMonthlyPage() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">給与詳細（月毎表示）</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            月毎表示の本実装は次のコミットで追加します。
          </p>
        </div>
        <PayrollDetailsViewSwitch
          mode="monthly"
          monthlyHref="/my/payroll-details/monthly"
          workplaceYearlyHref="/my/payroll-details/workplace-yearly"
        />
      </header>
    </section>
  );
}
