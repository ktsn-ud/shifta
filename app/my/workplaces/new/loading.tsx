import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function Loading() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">勤務先追加</h1>
      <FormLoadingSkeleton />
    </div>
  );
}
