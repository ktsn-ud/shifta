import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerProps = {
  className?: string;
  iconClassName?: string;
  label?: string;
};

type SpinnerPanelProps = {
  className?: string;
  label?: string;
  spinnerClassName?: string;
};

function Spinner({
  className,
  iconClassName,
  label = "読み込み中...",
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2Icon className={cn("size-4 animate-spin", iconClassName)} />
      <span>{label}</span>
    </div>
  );
}

function SpinnerPanel({
  className,
  label = "読み込み中...",
  spinnerClassName,
}: SpinnerPanelProps) {
  return (
    <div className={cn("flex items-center justify-center p-6", className)}>
      <Spinner className={spinnerClassName} label={label} />
    </div>
  );
}

export { Spinner, SpinnerPanel };
