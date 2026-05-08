import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

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
      <Link href={href} className={buttonVariants({ size: "sm" })}>
        {currentMode === "monthly"
          ? "勤務先別表示へ切り替え"
          : "月別表示へ切り替え"}
      </Link>
    </div>
  );
}
