import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { parseDateOnly } from "@/lib/api/date-time";
import { userShiftsTag, userWorkplacesTag } from "@/lib/cache/tags";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { prisma } from "@/lib/prisma";

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

async function getUnconfirmedShiftCountSource(
  userId: string,
  todayDate: string,
): Promise<number> {
  const timing = createRequestTiming("shifts:getUnconfirmedShiftCount");

  try {
    return await timing.measure("dbRead", () =>
      prisma.shift.count({
        where: {
          workplace: {
            userId,
          },
          date: {
            lte: parseDateOnly(todayDate),
          },
          isConfirmed: false,
        },
      }),
    );
  } finally {
    timing.flushLog();
  }
}

const loadCachedUnconfirmedShiftCount = cache(
  async (userId: string, todayDate: string): Promise<number> =>
    loadCachedUnconfirmedShiftCountEntry(userId, todayDate),
);

async function loadCachedUnconfirmedShiftCountEntry(
  userId: string,
  todayDate: string,
): Promise<number> {
  "use cache";

  cacheLife("minutes");
  cacheTag(userShiftsTag(userId));
  cacheTag(userWorkplacesTag(userId));

  return getUnconfirmedShiftCountSource(userId, todayDate);
}

export async function getUnconfirmedShiftCount(
  userId: string,
): Promise<number> {
  return loadCachedUnconfirmedShiftCount(
    userId,
    startOfUtcDay(new Date()).toISOString().slice(0, 10),
  );
}
