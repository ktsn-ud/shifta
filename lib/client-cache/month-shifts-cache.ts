"use client";

type MonthShiftsCacheEntry = {
  expiresAt: number;
  shifts: unknown[];
};

const monthShiftsCache = new Map<string, MonthShiftsCacheEntry>();

export function readMonthShiftsCache<T>(
  cacheKey: string,
  now: number = Date.now(),
): T[] | null {
  const cached = monthShiftsCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    monthShiftsCache.delete(cacheKey);
    return null;
  }

  return cached.shifts as T[];
}

export function writeMonthShiftsCache<T>(
  cacheKey: string,
  shifts: T[],
  ttlMs: number,
): void {
  monthShiftsCache.set(cacheKey, {
    shifts,
    expiresAt: Date.now() + ttlMs,
  });
}

export function deleteMonthShiftsCache(cacheKey: string): void {
  monthShiftsCache.delete(cacheKey);
}

export function clearMonthShiftsCache(): void {
  monthShiftsCache.clear();
}
