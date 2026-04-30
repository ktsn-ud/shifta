import { cn } from "@/lib/utils";

type ValueFrameProps = {
  label: string;
  value: string;
  tone?: "base" | "holiday" | "night" | "overtime" | "total" | "neutral";
  emphasis?: "normal" | "strong";
  className?: string;
};

const toneClasses: Record<NonNullable<ValueFrameProps["tone"]>, string> = {
  base: "border-blue-300 bg-blue-50/80 text-blue-900",
  holiday: "border-orange-300 bg-orange-50/80 text-orange-900",
  night: "border-violet-300 bg-violet-50/80 text-violet-900",
  overtime: "border-red-300 bg-red-50/80 text-red-900",
  total: "border-green-300 bg-green-50/80 text-green-900",
  neutral: "border-slate-300 bg-slate-50 text-slate-700",
};

const strongToneClasses: Record<
  NonNullable<ValueFrameProps["tone"]>,
  string
> = {
  base: "border-blue-400 bg-blue-100 text-blue-950",
  holiday: "border-orange-400 bg-orange-100 text-orange-950",
  night: "border-violet-400 bg-violet-100 text-violet-950",
  overtime: "border-red-400 bg-red-100 text-red-950",
  total: "border-green-400 bg-green-100 text-green-950",
  neutral: "border-slate-400 bg-slate-100 text-slate-800",
};

export function ValueFrame({
  label,
  value,
  tone = "neutral",
  emphasis = "normal",
  className,
}: ValueFrameProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[120px] flex-col rounded-md border px-2 py-1 text-left align-middle",
        emphasis === "strong" ? strongToneClasses[tone] : toneClasses[tone],
        className,
      )}
    >
      <span className="text-[11px] leading-none text-current/70">{label}</span>
      <span className="mt-1 text-xs leading-tight font-medium">{value}</span>
    </span>
  );
}
