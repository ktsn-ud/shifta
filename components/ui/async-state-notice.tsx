import { AlertTriangleIcon, LoaderCircleIcon, SaveIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AsyncStateNoticeProps = {
  title: string;
  description?: string;
  variant?: "refresh" | "saving" | "stale";
  className?: string;
};

const VARIANT_STYLES = {
  refresh: {
    badge: "outline" as const,
    badgeLabel: "更新中",
    icon: LoaderCircleIcon,
    iconClassName: "animate-spin text-sky-700",
    containerClassName:
      "border-sky-700/20 bg-sky-700/5 text-sky-950 dark:text-sky-100",
  },
  saving: {
    badge: "secondary" as const,
    badgeLabel: "保存中",
    icon: SaveIcon,
    iconClassName: "text-emerald-700",
    containerClassName:
      "border-emerald-700/20 bg-emerald-700/5 text-emerald-950 dark:text-emerald-100",
  },
  stale: {
    badge: "destructive" as const,
    badgeLabel: "前の表示を維持中",
    icon: AlertTriangleIcon,
    iconClassName: "text-amber-700",
    containerClassName:
      "border-amber-700/20 bg-amber-700/5 text-amber-950 dark:text-amber-100",
  },
};

export function AsyncStateNotice({
  title,
  description,
  variant = "refresh",
  className,
}: AsyncStateNoticeProps) {
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <div
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        style.containerClassName,
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Badge variant={style.badge}>{style.badgeLabel}</Badge>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon className={cn("mt-0.5 size-4 shrink-0", style.iconClassName)} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{title}</p>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
