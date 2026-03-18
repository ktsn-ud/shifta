import type { HolidayType } from "@/lib/generated/prisma/enums";

const MINUTES_IN_DAY = 24 * 60;

function toMinutes(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

export function calculateNightHours(
  startTime: Date,
  endTime: Date,
  nightStart: Date,
  nightEnd: Date,
): number {
  const shiftStart = toMinutes(startTime);
  const shiftEndRaw = toMinutes(endTime);
  const shiftEnd =
    shiftEndRaw <= shiftStart ? shiftEndRaw + MINUTES_IN_DAY : shiftEndRaw;

  const nightStartMinutes = toMinutes(nightStart);
  const nightEndMinutes = toMinutes(nightEnd);

  const baseNightIntervals: Array<[number, number]> =
    nightEndMinutes <= nightStartMinutes
      ? [
          [nightStartMinutes, MINUTES_IN_DAY],
          [0, nightEndMinutes],
        ]
      : [[nightStartMinutes, nightEndMinutes]];

  const extendedIntervals = [
    ...baseNightIntervals,
    ...baseNightIntervals.map(
      ([start, end]) =>
        [start + MINUTES_IN_DAY, end + MINUTES_IN_DAY] as [number, number],
    ),
  ];

  const overlap = extendedIntervals.reduce((total, [start, end]) => {
    return total + overlapMinutes(shiftStart, shiftEnd, start, end);
  }, 0);

  return overlap / 60;
}

export function calculateOvertimeHours(
  totalHours: number,
  threshold: number,
): number {
  return Math.max(0, totalHours - threshold);
}

export function isHolidayDate(date: Date, holidayType: HolidayType): boolean {
  if (holidayType === "NONE") {
    return false;
  }

  if (holidayType === "HOLIDAY") {
    return false;
  }

  if (holidayType === "WEEKEND" || holidayType === "WEEKEND_HOLIDAY") {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  return false;
}
