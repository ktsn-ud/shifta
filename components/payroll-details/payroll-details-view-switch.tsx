import Link from "next/link";
import { Button } from "@/components/ui/button";

type PayrollDetailsViewMode = "monthly" | "workplace-yearly";

type PayrollDetailsViewSwitchProps = {
  currentMode: PayrollDetailsViewMode;
  href: string;
};

export function PayrollDetailsViewSwitch({
  currentMode,
  href,
}: PayrollDetailsViewSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" render={<Link href={href} />}>
        {currentMode === "monthly"
          ? "勤務先別表示へ切り替え"
          : "月別表示へ切り替え"}
      </Button>
    </div>
  );
}
