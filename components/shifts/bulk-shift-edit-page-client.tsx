"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  normalizeMonthShift,
  useMonthShifts,
  type MonthShift,
} from "@/hooks/use-month-shifts";
import {
  addMonths,
  dateKeyFromApiDate,
  fromMonthInputValue,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { upsertMonthShiftsInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { getLessonSelectionValues } from "@/components/shifts/bulk-shift-form/view-helpers";
import {
  BULK_SHIFT_EDIT_LIMIT_MESSAGE,
  MAX_BULK_SHIFT_EDIT_COUNT,
} from "@/lib/validation/batch-limits";
import {
  createDraft,
  draftChanged,
} from "@/components/shifts/bulk-shift-edit-helpers";
import { BulkShiftEditPayrollPreview } from "@/components/shifts/bulk-shift-edit-payroll-preview";
import { BulkShiftEditTable } from "@/components/shifts/bulk-shift-edit-table";
import { BulkShiftEditToolbar } from "@/components/shifts/bulk-shift-edit-toolbar";
import type {
  BulkShiftEditPageClientProps,
  Draft,
  TimetableSet,
} from "@/components/shifts/bulk-shift-edit-types";

export function BulkShiftEditPageClient(props: BulkShiftEditPageClientProps) {
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
  const dirtyIds = useMemo(() => {
    const ids: string[] = [];
    for (const shift of shifts) {
      const draft = drafts.get(shift.id);
      if (draft && draftChanged(shift, draft)) ids.push(shift.id);
    }
    return ids;
  }, [drafts, shifts]);
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
    const edits = [] as Array<
      | {
          id: string;
          shiftType: "NORMAL";
          startTime: string;
          endTime: string;
          breakMinutes: number;
          transportationAllowance: number;
          comment: string;
        }
      | {
          id: string;
          shiftType: "LESSON";
          lessonRange: {
            timetableSetId: string;
            startPeriod: number;
            endPeriod: number;
          };
          transportationAllowance: number;
          comment: string;
        }
    >;
    for (const shift of shifts) {
      if (!dirtySet.has(shift.id)) continue;
      const draft = drafts.get(shift.id) ?? createDraft(shift);
      edits.push(
        shift.shiftType === "NORMAL"
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
            },
      );
    }
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
    <section
      className="flex flex-col gap-6 p-4 pb-32 md:p-6 md:pb-6"
      aria-busy={saving || isRefreshing}
    >
      <BulkShiftEditToolbar
        dirtyCount={dirtyIds.length}
        month={month}
        order={order}
        saving={saving}
        onMove={move}
        onOrderChange={setOrder}
        onSave={save}
      />
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      <BulkShiftEditTable
        drafts={drafts}
        errors={errors}
        rows={rows}
        saving={saving}
        timetableSets={props.timetableSets}
        createDraft={createDraft}
        onUpdate={update}
        onTimetableSetChange={updateLessonTimetableSet}
        onStartPeriodChange={updateLessonStartPeriod}
      />
      <BulkShiftEditPayrollPreview
        currentUserId={props.currentUserId}
        shifts={shifts}
        drafts={drafts}
        timetableSets={props.timetableSets}
        workplaces={props.previewWorkplaces}
        payrollRules={props.previewPayrollRules}
      />
    </section>
  );
}
