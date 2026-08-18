import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonthLabel } from "@/lib/calendar/date";

type Props = {
  dirtyCount: number;
  month: Date;
  order: "date" | "workplace";
  saving: boolean;
  onMove: (delta: number) => void;
  onOrderChange: (order: "date" | "workplace") => void;
  onSave: () => void;
};

export function BulkShiftEditToolbar({
  dirtyCount,
  month,
  order,
  saving,
  onMove,
  onOrderChange,
  onSave,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">シフト一括編集</h2>
          <p className="text-sm text-muted-foreground">
            編集可能なセルだけを変更し、変更行のみ保存します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onMove(-1)}
          >
            前月
          </Button>
          <span className="min-w-24 text-center font-medium">
            {formatMonthLabel(month)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onMove(1)}
          >
            翌月
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">並び替え</span>
          <Select
            value={order}
            onValueChange={(value) => {
              if (value === "date" || value === "workplace") {
                onOrderChange(value);
              }
            }}
            disabled={saving}
          >
            <SelectTrigger size="sm">
              <SelectValue>
                {order === "date" ? "日付順" : "勤務先順"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="date">日付順</SelectItem>
                <SelectItem value="workplace">勤務先順</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            変更 {dirtyCount} 件
          </span>
          <Button disabled={saving || dirtyCount === 0} onClick={onSave}>
            {saving ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </div>
    </>
  );
}
