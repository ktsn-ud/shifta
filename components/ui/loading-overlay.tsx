import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type LoadingOverlayProps = {
  children: ReactNode;
  isLoading: boolean;
  label?: string;
  className?: string;
  contentClassName?: string;
  overlayClassName?: string;
};

export function LoadingOverlay({
  children,
  isLoading,
  label = "最新データを更新中...",
  className,
  contentClassName,
  overlayClassName,
}: LoadingOverlayProps) {
  return (
    <div
      aria-busy={isLoading || undefined}
      className={cn("relative", className)}
    >
      <div className={cn(isLoading && "pointer-events-none", contentClassName)}>
        {children}
      </div>
      {isLoading ? (
        <div
          className={cn(
            "absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/75 backdrop-blur-[1px]",
            overlayClassName,
          )}
        >
          <Spinner
            className="rounded-md bg-background/90 px-4 py-3 shadow-sm"
            label={label}
          />
        </div>
      ) : null}
    </div>
  );
}
