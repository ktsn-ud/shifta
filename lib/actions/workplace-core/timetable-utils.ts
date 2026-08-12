import { toMinutes } from "@/lib/api/date-time";

type TimetableItemInput = {
  period: number;
  startTime: string;
  endTime: string;
};

export function toTimeOnly(value: Date): string {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function validateTimetableItems(
  items: TimetableItemInput[],
): string | null {
  for (const item of items) {
    if (toMinutes(item.startTime) >= toMinutes(item.endTime)) {
      return "startTime は endTime より前にしてください";
    }
  }

  const periods = new Set<number>();
  for (const item of items) {
    if (periods.has(item.period)) {
      return "同じ時間割セット内で period が重複しています";
    }
    periods.add(item.period);
  }

  return null;
}
