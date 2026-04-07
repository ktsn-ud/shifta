import { SpinnerPanel } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type TableLoadingSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

type StatCardsLoadingSkeletonProps = {
  count?: number;
  className?: string;
};

function FormLoadingSkeleton({ className }: { className?: string }) {
  return (
    <SpinnerPanel
      className={cn("min-h-[560px] max-w-2xl", className)}
      label="フォームを読み込み中..."
    />
  );
}

function TableLoadingSkeleton({
  rows = 4,
  columns = 3,
  className,
}: TableLoadingSkeletonProps) {
  return (
    <SpinnerPanel
      className={cn("min-h-[220px]", className)}
      label={`テーブルを読み込み中... (${rows}x${columns})`}
    />
  );
}

function CalendarLoadingSkeleton() {
  return (
    <SpinnerPanel
      className="min-h-[640px] md:min-h-[760px]"
      label="カレンダーを読み込み中..."
    />
  );
}

function StatCardsLoadingSkeleton({
  count = 3,
  className,
}: StatCardsLoadingSkeletonProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      <SpinnerPanel
        className="col-span-full min-h-[160px]"
        label={`集計カードを読み込み中... (${count}件)`}
      />
    </div>
  );
}

export {
  CalendarLoadingSkeleton,
  FormLoadingSkeleton,
  StatCardsLoadingSkeleton,
  TableLoadingSkeleton,
};
