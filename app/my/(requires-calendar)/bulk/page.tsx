import type { Metadata } from "next";
import { connection } from "next/server";
import { toDateKey, toMonthInputValue } from "@/lib/calendar/date";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

export default async function BulkPage() {
  await connection();
  const today = new Date();

  return (
    <BulkShiftFormLazy
      initialMonthInputValue={toMonthInputValue(today)}
      todayDateKey={toDateKey(today)}
    />
  );
}
