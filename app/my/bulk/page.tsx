import type { Metadata } from "next";
import { BulkShiftForm } from "@/components/shifts/BulkShiftForm";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

export default function BulkPage() {
  return <BulkShiftForm />;
}
