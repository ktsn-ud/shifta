import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { prisma } from "@/lib/prisma";

const DATE_PART_PADDING = 2;
const dateWithWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "UTC",
});

export type UnconfirmedShiftApiItem = {
  id: string;
  workplaceId: string;
  comment: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  transportationAllowance: number;
  isConfirmed: boolean;
  workplace: {
    id: string;
    name: string;
    color: string;
  };
};

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

function toDateOnlyString(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function toTimeOnlyString(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateWithWeekday(dateOnly: string): string {
  return dateWithWeekdayFormatter.format(parseDateOnly(dateOnly));
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

async function getUnconfirmedShiftRows(userId: string) {
  return prisma.shift.findMany({
    where: {
      workplace: {
        userId,
      },
      date: {
        lte: startOfUtcDay(new Date()),
      },
      isConfirmed: false,
    },
    include: {
      workplace: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

function mapUnconfirmedShiftApiItems(
  unconfirmedShiftsRaw: Awaited<ReturnType<typeof getUnconfirmedShiftRows>>,
): UnconfirmedShiftApiItem[] {
  return unconfirmedShiftsRaw.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplace.id,
    comment: shift.comment,
    date: toDateOnlyString(shift.date),
    startTime: toTimeOnlyString(shift.startTime),
    endTime: toTimeOnlyString(shift.endTime),
    breakMinutes: shift.breakMinutes,
    transportationAllowance: shift.transportationAllowance,
    isConfirmed: shift.isConfirmed,
    workplace: shift.workplace,
  }));
}

export async function getUnconfirmedShiftApiItems(
  userId: string,
): Promise<UnconfirmedShiftApiItem[]> {
  const rows = await getUnconfirmedShiftRows(userId);
  return mapUnconfirmedShiftApiItems(rows);
}

export async function getShiftConfirmationInitialData(
  userId: string,
): Promise<UnconfirmedShiftItem[]> {
  const unconfirmedRows = await getUnconfirmedShiftRows(userId);
  const unconfirmedApiItems = mapUnconfirmedShiftApiItems(unconfirmedRows);

  return unconfirmedApiItems.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: formatDateWithWeekday(shift.date),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
    transportationAllowance: shift.transportationAllowance,
  }));
}
