export type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
export type ShiftType = "NORMAL" | "LESSON";
export type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";

const workplaceTypeLabels: Record<WorkplaceType, string> = {
  GENERAL: "一般",
  CRAM_SCHOOL: "塾",
};

const shiftTypeLabels: Record<ShiftType, string> = {
  NORMAL: "通常",
  LESSON: "授業",
};

const holidayTypeLabels: Record<HolidayType, string> = {
  NONE: "なし",
  WEEKEND: "土日",
  HOLIDAY: "祝日",
  WEEKEND_HOLIDAY: "土日・祝日",
};

export function formatWorkplaceType(type: WorkplaceType): string {
  return workplaceTypeLabels[type];
}

export function formatShiftType(type: ShiftType): string {
  return shiftTypeLabels[type];
}

export function formatHolidayType(type: HolidayType): string {
  return holidayTypeLabels[type];
}
