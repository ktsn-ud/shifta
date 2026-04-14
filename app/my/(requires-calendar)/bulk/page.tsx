import type { Metadata } from "next";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

export default function BulkPage() {
  return <BulkShiftFormLazy />;
}
