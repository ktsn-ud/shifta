import type { Metadata } from "next";
import { connection } from "next/server";
import {
  fromMonthInputValue,
  toDateKey,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

type ShiftBulkPageSearchParams = {
  month?: string | string[];
};

type ShiftBulkPageProps = {
  searchParams?: ShiftBulkPageSearchParams | Promise<ShiftBulkPageSearchParams>;
};

export default async function ShiftBulkPage({
  searchParams,
}: ShiftBulkPageProps) {
  await connection();
  const today = new Date();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedMonth =
    typeof resolvedSearchParams.month === "string"
      ? fromMonthInputValue(resolvedSearchParams.month)
      : null;

  return (
    <BulkShiftFormLazy
      initialMonthInputValue={toMonthInputValue(requestedMonth ?? today)}
      todayDateKey={toDateKey(today)}
    />
  );
}
