import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  draftFieldsChanged,
  getEndPeriods,
  getLessonDerivedValues,
} from "@/components/shifts/bulk-shift-edit-helpers";
import type {
  Draft,
  TimetableSet,
} from "@/components/shifts/bulk-shift-edit-types";
import type { MonthShift } from "@/hooks/use-month-shifts";
import { dateKeyFromApiDate } from "@/lib/calendar/date";
import { cn } from "@/lib/utils";

const DIRTY_CONTROL_CLASS = "bg-accent/65 disabled:bg-accent/65";

type Props = {
  drafts: Map<string, Draft>;
  errors: Map<string, string>;
  rows: MonthShift[];
  saving: boolean;
  timetableSets: TimetableSet[];
  createDraft: (shift: MonthShift) => Draft;
  onUpdate: (id: string, field: keyof Draft, value: string) => void;
  onTimetableSetChange: (
    id: string,
    timetableSetId: string,
    sets: TimetableSet[],
  ) => void;
  onStartPeriodChange: (id: string, startPeriod: string) => void;
};

export function BulkShiftEditTable({
  drafts,
  errors,
  rows,
  saving,
  timetableSets,
  createDraft,
  onUpdate,
  onTimetableSetChange,
  onStartPeriodChange,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>日付</TableHead>
          <TableHead>勤務先</TableHead>
          <TableHead>種別・確定</TableHead>
          <TableHead>時間 / 時間割</TableHead>
          <TableHead>休憩</TableHead>
          <TableHead>交通費</TableHead>
          <TableHead>コメント</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((shift) => (
          <BulkShiftEditRow
            key={shift.id}
            shift={shift}
            draft={drafts.get(shift.id) ?? createDraft(shift)}
            error={errors.get(shift.id)}
            saving={saving}
            timetableSets={timetableSets}
            onUpdate={onUpdate}
            onTimetableSetChange={onTimetableSetChange}
            onStartPeriodChange={onStartPeriodChange}
          />
        ))}
      </TableBody>
    </Table>
  );
}

type RowProps = Omit<Props, "drafts" | "errors" | "rows" | "createDraft"> & {
  shift: MonthShift;
  draft: Draft;
  error: string | undefined;
};

function BulkShiftEditRow({
  shift,
  draft,
  error,
  saving,
  timetableSets,
  onUpdate,
  onTimetableSetChange,
  onStartPeriodChange,
}: RowProps) {
  const sets = timetableSets.filter(
    (set) => set.workplaceId === shift.workplaceId,
  );
  const selectedSet = sets.find((set) => set.id === draft.timetableSetId);
  const derivedValues = getLessonDerivedValues(selectedSet, draft);
  const endPeriods = getEndPeriods(selectedSet?.periods, draft.startPeriod);

  return (
    <TableRow>
      <TableCell>{dateKeyFromApiDate(shift.date)}</TableCell>
      <TableCell>{shift.workplace.name}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant="secondary">
            {shift.shiftType === "LESSON" ? "授業" : "通常"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {shift.isConfirmed ? "確定済み" : "未確定"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {shift.shiftType === "NORMAL" ? (
          <div className="flex gap-2">
            <Input
              className={cn(
                draftFieldsChanged(shift, draft, ["startTime"]) &&
                  DIRTY_CONTROL_CLASS,
              )}
              aria-label={`${shift.id} 開始`}
              type="time"
              value={draft.startTime}
              disabled={saving}
              onChange={(event) =>
                onUpdate(shift.id, "startTime", event.target.value)
              }
            />
            <Input
              className={cn(
                draftFieldsChanged(shift, draft, ["endTime"]) &&
                  DIRTY_CONTROL_CLASS,
              )}
              aria-label={`${shift.id} 終了`}
              type="time"
              value={draft.endTime}
              disabled={saving}
              onChange={(event) =>
                onUpdate(shift.id, "endTime", event.target.value)
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Select
                value={draft.timetableSetId}
                disabled={saving}
                onValueChange={(value) => {
                  if (value !== null)
                    onTimetableSetChange(shift.id, value, sets);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="時間割セット"
                  className={cn(
                    draftFieldsChanged(shift, draft, ["timetableSetId"]) &&
                      DIRTY_CONTROL_CLASS,
                  )}
                >
                  <SelectValue placeholder="時間割セット" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={draft.startPeriod}
                disabled={saving}
                onValueChange={(value) => {
                  if (value !== null) onStartPeriodChange(shift.id, value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="開始コマ"
                  className={cn(
                    draftFieldsChanged(shift, draft, ["startPeriod"]) &&
                      DIRTY_CONTROL_CLASS,
                  )}
                >
                  <SelectValue placeholder="開始コマ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {selectedSet?.periods.map((period) => (
                      <SelectItem
                        key={period.period}
                        value={String(period.period)}
                      >
                        {period.period}限
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={draft.endPeriod}
                disabled={saving}
                onValueChange={(value) => {
                  if (value !== null) onUpdate(shift.id, "endPeriod", value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="終了コマ"
                  className={cn(
                    draftFieldsChanged(shift, draft, ["endPeriod"]) &&
                      DIRTY_CONTROL_CLASS,
                  )}
                >
                  <SelectValue placeholder="終了コマ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {endPeriods.map((period) => (
                      <SelectItem
                        key={period.period}
                        value={String(period.period)}
                      >
                        {period.period}限
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              導出:{" "}
              {derivedValues
                ? `${derivedValues.startTime}〜${derivedValues.endTime} / 休憩${derivedValues.breakMinutes}分`
                : "時間割を選択してください"}
            </span>
          </div>
        )}
      </TableCell>
      <TableCell>
        {shift.shiftType === "NORMAL" ? (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <Input
              className={cn(
                "w-20",
                draftFieldsChanged(shift, draft, ["breakMinutes"]) &&
                  DIRTY_CONTROL_CLASS,
              )}
              aria-label={`${shift.id} 休憩`}
              type="number"
              min="0"
              value={draft.breakMinutes}
              disabled={saving}
              onChange={(event) =>
                onUpdate(shift.id, "breakMinutes", event.target.value)
              }
            />
            <span>分</span>
          </div>
        ) : (
          "導出"
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Input
            className={cn(
              "w-24",
              draftFieldsChanged(shift, draft, ["transportationAllowance"]) &&
                DIRTY_CONTROL_CLASS,
            )}
            aria-label={`${shift.id} 交通費`}
            type="number"
            min="0"
            value={draft.transportationAllowance}
            disabled={saving}
            onChange={(event) =>
              onUpdate(shift.id, "transportationAllowance", event.target.value)
            }
          />
          <span>円</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Input
            className={cn(
              draftFieldsChanged(shift, draft, ["comment"]) &&
                DIRTY_CONTROL_CLASS,
            )}
            aria-label={`${shift.id} コメント`}
            value={draft.comment}
            disabled={saving}
            maxLength={100}
            onChange={(event) =>
              onUpdate(shift.id, "comment", event.target.value)
            }
          />
          {error ? (
            <span className="text-xs text-destructive">{error}</span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
