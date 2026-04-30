import { cn } from "@/lib/utils";

type ValueFrameProps = {
  label: string;
  value: string;
  className?: string;
};

export function ValueFrame({ label, value, className }: ValueFrameProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[120px] flex-col rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-left align-middle",
        className,
      )}
    >
      <span className="text-[11px] leading-none text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-xs leading-tight font-medium">{value}</span>
    </span>
  );
}
