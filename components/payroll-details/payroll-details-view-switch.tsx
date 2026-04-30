import Link from "next/link";
import { Button } from "@/components/ui/button";

type PayrollDetailsViewMode = "monthly" | "workplace-yearly";

type PayrollDetailsViewSwitchProps = {
  mode: PayrollDetailsViewMode;
  monthlyHref: string;
  workplaceYearlyHref: string;
};

export function PayrollDetailsViewSwitch({
  mode,
  monthlyHref,
  workplaceYearlyHref,
}: PayrollDetailsViewSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={mode === "monthly" ? "default" : "outline"}
        size="sm"
        render={<Link href={monthlyHref} prefetch={false} />}
      >
        月毎表示
      </Button>
      <Button
        type="button"
        variant={mode === "workplace-yearly" ? "default" : "outline"}
        size="sm"
        render={<Link href={workplaceYearlyHref} prefetch={false} />}
      >
        勤務先毎表示
      </Button>
    </div>
  );
}
