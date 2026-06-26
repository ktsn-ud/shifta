type LessonRange = {
  startPeriod: number;
  endPeriod: number;
  timetableSetId: string;
};

type ShiftForEstimate = {
  date: Date;
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON";
  lessonRange: LessonRange | null;
};

function calculateTotalMinutes(startTime: Date, endTime: Date): number {
  const startMinutes = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
  const endMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
  const adjustedEnd =
    endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
  return adjustedEnd - startMinutes;
}

export function calculateWorkedMinutes(shift: ShiftForEstimate): number {
  const totalMinutes = calculateTotalMinutes(shift.startTime, shift.endTime);
  const workedMinutes = totalMinutes - shift.breakMinutes;

  if (workedMinutes < 0) {
    return 0;
  }

  return workedMinutes;
}
