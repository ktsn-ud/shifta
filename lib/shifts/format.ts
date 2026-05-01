import type { ShiftType, WorkplaceType } from "@/lib/enum-labels";

type ShiftWorkplaceLabelInput = {
  workplaceName: string;
  workplaceType?: WorkplaceType;
  shiftType?: ShiftType;
  comment?: string | null;
};

export function formatShiftWorkplaceLabel({
  workplaceName,
  comment,
}: ShiftWorkplaceLabelInput): string {
  const trimmedComment = comment?.trim() ?? "";
  if (trimmedComment.length > 0) {
    return `${workplaceName} (${trimmedComment})`;
  }

  return workplaceName;
}
