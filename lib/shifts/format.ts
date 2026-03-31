import type { ShiftType, WorkplaceType } from "@/lib/enum-labels";

type ShiftWorkplaceLabelInput = {
  workplaceName: string;
  workplaceType: WorkplaceType;
  shiftType: ShiftType;
};

export function formatShiftWorkplaceLabel({
  workplaceName,
  workplaceType,
  shiftType,
}: ShiftWorkplaceLabelInput): string {
  if (workplaceType === "CRAM_SCHOOL" && shiftType === "NORMAL") {
    return `${workplaceName}（事務）`;
  }

  return workplaceName;
}
