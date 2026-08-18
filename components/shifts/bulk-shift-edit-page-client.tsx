"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useMonthShifts, type MonthShift } from "@/hooks/use-month-shifts";
import {
  addMonths,
  dateKeyFromApiDate,
  formatMonthLabel,
  fromMonthInputValue,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { upsertMonthShiftsInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { normalizeMonthShift } from "@/hooks/use-month-shifts";
import { getLessonSelectionValues } from "@/components/shifts/bulk-shift-form/view-helpers";
import { resolveLessonTimeRangeFromRows } from "@/lib/shifts/lesson-time-range";
import {
  BULK_SHIFT_EDIT_LIMIT_MESSAGE,
  MAX_BULK_SHIFT_EDIT_COUNT,
} from "@/lib/validation/batch-limits";

type TimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  periods: Array<{ period: number; startTime: string; endTime: string }>;
};
type Draft = {
  startTime: string;
  endTime: string;
  breakMinutes: string;
  transportationAllowance: string;
  comment: string;
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
};

function time(value: string) {
  return value.slice(11, 16);
}
function createDraft(shift: MonthShift): Draft {
  return {
    startTime: time(shift.startTime),
    endTime: time(shift.endTime),
    breakMinutes: String(shift.breakMinutes),
    transportationAllowance: String(shift.transportationAllowance),
    comment: shift.comment ?? "",
    timetableSetId: shift.lessonRange?.timetableSetId ?? "",
    startPeriod: String(shift.lessonRange?.startPeriod ?? ""),
    endPeriod: String(shift.lessonRange?.endPeriod ?? ""),
  };
}
function draftChanged(shift: MonthShift, draft: Draft) {
  return JSON.stringify(createDraft(shift)) !== JSON.stringify(draft);
}

function getLessonDerivedValues(
  timetableSet: TimetableSet | undefined,
  draft: Draft,
): { startTime: string; endTime: string; breakMinutes: number } | null {
  const startPeriod = Number(draft.startPeriod);
  const endPeriod = Number(draft.endPeriod);
  if (
    !timetableSet ||
    !Number.isInteger(startPeriod) ||
    !Number.isInteger(endPeriod) ||
    startPeriod > endPeriod
  ) {
    return null;
  }

  try {
    const value = resolveLessonTimeRangeFromRows(
      { startPeriod, endPeriod },
      timetableSet.periods
        .filter(
          (period) =>
            period.period >= startPeriod && period.period <= endPeriod,
        )
        .map((period) => ({
          period: period.period,
          startTime: new Date(period.startTime),
          endTime: new Date(period.endTime),
        })),
    );
    return {
      startTime: time(value.startTime.toISOString()),
      endTime: time(value.endTime.toISOString()),
      breakMinutes: value.breakMinutes,
    };
  } catch {
    return null;
  }
}

export function BulkShiftEditPageClient(props: {
  currentUserId: string;
  initialMonth: string;
  initialShifts: MonthShift[];
  initialStartDate: string;
  initialEndDate: string;
  timetableSets: TimetableSet[];
}) {
  const router = useRouter();
  const month = useMemo(
    () => fromMonthInputValue(props.initialMonth) ?? new Date(),
    [props.initialMonth],
  );
  const { shifts, isRefreshing, errorMessage } = useMonthShifts(month, {
    cacheUserKey: props.currentUserId,
    initialShifts: props.initialShifts,
    initialStartDate: props.initialStartDate,
    initialEndDate: props.initialEndDate,
  });
  const [drafts, setDrafts] = useState(
    () =>
      new Map(
        props.initialShifts.map((shift) => [shift.id, createDraft(shift)]),
      ),
  );
  const [errors, setErrors] = useState(() => new Map<string, string>());
  const [order, setOrder] = useState<"date" | "workplace">("date");
  const [saving, setSaving] = useState(false);
  const dirtyIds = useMemo(
    () =>
      shifts
        .filter((shift) => {
          const draft = drafts.get(shift.id);
          return draft ? draftChanged(shift, draft) : false;
        })
        .map((shift) => shift.id),
    [drafts, shifts],
  );
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyIds.length > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyIds.length]);

  const rows = useMemo(
    () =>
      shifts.toSorted((a, b) =>
        order === "date"
          ? dateKeyFromApiDate(a.date).localeCompare(
              dateKeyFromApiDate(b.date),
            ) || a.id.localeCompare(b.id)
          : a.workplace.name.localeCompare(b.workplace.name, "ja") ||
            dateKeyFromApiDate(a.date).localeCompare(
              dateKeyFromApiDate(b.date),
            ) ||
            a.id.localeCompare(b.id),
      ),
    [order, shifts],
  );
  function update(id: string, field: keyof Draft, value: string) {
    setDrafts((current) => {
      const next = new Map(current);
      const previous = next.get(id);
      if (previous) next.set(id, { ...previous, [field]: value });
      return next;
    });
    setErrors((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
  function updateLessonTimetableSet(
    id: string,
    timetableSetId: string,
    sets: TimetableSet[],
  ) {
    const lessonPeriodsBySetId = Object.fromEntries(
      sets.map((set) => [set.id, set.periods.map((period) => period.period)]),
    );
    const selection = getLessonSelectionValues(
      timetableSetId,
      lessonPeriodsBySetId,
      sets[0]?.id ?? "",
    );
    setDrafts((current) => {
      const next = new Map(current);
      const previous = next.get(id);
      if (previous) next.set(id, { ...previous, ...selection });
      return next;
    });
    setErrors((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
  function updateLessonStartPeriod(id: string, startPeriod: string) {
    setDrafts((current) => {
      const next = new Map(current);
      const previous = next.get(id);
      if (!previous) return next;
      const endPeriod = Number(previous.endPeriod);
      const nextStartPeriod = Number(startPeriod);
      next.set(id, {
        ...previous,
        startPeriod,
        endPeriod:
          Number.isInteger(endPeriod) && endPeriod >= nextStartPeriod
            ? previous.endPeriod
            : startPeriod,
      });
      return next;
    });
    setErrors((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
  function move(delta: number) {
    if (
      dirtyIds.length > 0 &&
      !window.confirm("未保存の変更があります。移動しますか？")
    )
      return;
    router.replace(
      `/my/shifts/bulk-edit?month=${toMonthInputValue(addMonths(month, delta))}`,
    );
  }
  async function save() {
    const edits = shifts
      .filter((shift) => dirtySet.has(shift.id))
      .map((shift) => {
        const draft = drafts.get(shift.id) ?? createDraft(shift);
        return shift.shiftType === "NORMAL"
          ? {
              id: shift.id,
              shiftType: "NORMAL",
              startTime: draft.startTime,
              endTime: draft.endTime,
              breakMinutes: Number(draft.breakMinutes),
              transportationAllowance: Number(draft.transportationAllowance),
              comment: draft.comment,
            }
          : {
              id: shift.id,
              shiftType: "LESSON",
              lessonRange: {
                timetableSetId: draft.timetableSetId,
                startPeriod: Number(draft.startPeriod),
                endPeriod: Number(draft.endPeriod),
              },
              transportationAllowance: Number(draft.transportationAllowance),
              comment: draft.comment,
            };
      });
    if (edits.length === 0) return;
    if (edits.length > MAX_BULK_SHIFT_EDIT_COUNT) {
      toast.error(BULK_SHIFT_EDIT_LIMIT_MESSAGE);
      return;
    }
    setSaving(true);
    setErrors(new Map());
    try {
      const response = await fetch("/api/shifts/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: edits }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "一括保存に失敗しました。";
        setErrors(new Map(edits.map((edit) => [edit.id, message])));
        throw new Error(message);
      }
      const updated =
        typeof payload === "object" &&
        payload &&
        "data" in payload &&
        Array.isArray(payload.data)
          ? payload.data
              .map(normalizeMonthShift)
              .filter((value): value is MonthShift => value !== null)
          : [];
      upsertMonthShiftsInCachesOptimistically(getBrowserQueryClient(), updated);
      setDrafts((current) => {
        const next = new Map(current);
        for (const shift of updated) next.set(shift.id, createDraft(shift));
        return next;
      });
      void invalidateAfterShiftMutation(getBrowserQueryClient(), {
        mode: "background",
        refetchType: "none",
      });
      toast.success(
        `${updated.length}件を保存しました。Google Calendar への同期を保留中です。`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "一括保存に失敗しました。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-6" aria-busy={saving || isRefreshing}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">シフト一括編集</h2>
          <p className="text-sm text-muted-foreground">
            編集可能なセルだけを変更し、変更行のみ保存します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => move(-1)}
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
            onClick={() => move(1)}
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
            onValueChange={(value) => setOrder(value as "date" | "workplace")}
            disabled={saving}
          >
            <SelectTrigger size="sm">
              <SelectValue />
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
            変更 {dirtyIds.length} 件
          </span>
          <Button disabled={saving || dirtyIds.length === 0} onClick={save}>
            {saving ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </div>
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
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
          {rows.map((shift) => {
            const draft = drafts.get(shift.id) ?? createDraft(shift);
            const sets = props.timetableSets.filter(
              (set) => set.workplaceId === shift.workplaceId,
            );
            const selectedSet = sets.find(
              (set) => set.id === draft.timetableSetId,
            );
            const derivedValues = getLessonDerivedValues(selectedSet, draft);
            return (
              <TableRow
                key={shift.id}
                data-state={dirtySet.has(shift.id) ? "selected" : undefined}
              >
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
                        aria-label={`${shift.id} 開始`}
                        type="time"
                        value={draft.startTime}
                        disabled={saving}
                        onChange={(event) =>
                          update(shift.id, "startTime", event.target.value)
                        }
                      />
                      <Input
                        aria-label={`${shift.id} 終了`}
                        type="time"
                        value={draft.endTime}
                        disabled={saving}
                        onChange={(event) =>
                          update(shift.id, "endTime", event.target.value)
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
                            if (value !== null) {
                              updateLessonTimetableSet(shift.id, value, sets);
                            }
                          }}
                        >
                          <SelectTrigger size="sm">
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
                            if (value !== null)
                              updateLessonStartPeriod(shift.id, value);
                          }}
                        >
                          <SelectTrigger size="sm">
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
                            if (value !== null)
                              update(shift.id, "endPeriod", value);
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="終了コマ" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {selectedSet?.periods
                                .filter(
                                  (period) =>
                                    period.period >= Number(draft.startPeriod),
                                )
                                .map((period) => (
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
                    <Input
                      aria-label={`${shift.id} 休憩`}
                      type="number"
                      min="0"
                      value={draft.breakMinutes}
                      disabled={saving}
                      onChange={(event) =>
                        update(shift.id, "breakMinutes", event.target.value)
                      }
                    />
                  ) : (
                    "導出"
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`${shift.id} 交通費`}
                    type="number"
                    min="0"
                    value={draft.transportationAllowance}
                    disabled={saving}
                    onChange={(event) =>
                      update(
                        shift.id,
                        "transportationAllowance",
                        event.target.value,
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`${shift.id} コメント`}
                      value={draft.comment}
                      disabled={saving}
                      maxLength={100}
                      onChange={(event) =>
                        update(shift.id, "comment", event.target.value)
                      }
                    />
                    {errors.get(shift.id) ? (
                      <span className="text-xs text-destructive">
                        {errors.get(shift.id)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
