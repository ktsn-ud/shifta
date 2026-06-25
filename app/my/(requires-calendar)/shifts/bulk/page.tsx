import type { Metadata } from "next";
import { toDateKey, toMonthInputValue } from "@/lib/calendar/date";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

export default function ShiftBulkPage() {
  const today = new Date();

  return (
    <BulkShiftFormLazy
      initialMonthInputValue={toMonthInputValue(today)}
      todayDateKey={toDateKey(today)}
    />
  );
}
