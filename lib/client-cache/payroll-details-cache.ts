"use client";

type MonthlyCacheEntry<T> = {
  expiresAt: number;
  details: T;
};

type YearlyCacheEntry<T> = {
  expiresAt: number;
  details: T;
};

const monthlyCache = new Map<string, MonthlyCacheEntry<unknown>>();
const yearlyCache = new Map<string, YearlyCacheEntry<unknown>>();

export function readPayrollDetailsMonthlyCache<T>(cacheKey: string): T | null {
  const cached = monthlyCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    monthlyCache.delete(cacheKey);
    return null;
  }

  return cached.details as T;
}

export function writePayrollDetailsMonthlyCache<T>(
  cacheKey: string,
  details: T,
  ttlMs: number,
): void {
  monthlyCache.set(cacheKey, {
    details,
    expiresAt: Date.now() + ttlMs,
  });
}

export function readPayrollDetailsYearlyCache<T>(cacheKey: string): T | null {
  const cached = yearlyCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    yearlyCache.delete(cacheKey);
    return null;
  }

  return cached.details as T;
}

export function writePayrollDetailsYearlyCache<T>(
  cacheKey: string,
  details: T,
  ttlMs: number,
): void {
  yearlyCache.set(cacheKey, {
    details,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearPayrollDetailsMonthlyCache(): void {
  monthlyCache.clear();
}

export function clearPayrollDetailsYearlyCache(): void {
  yearlyCache.clear();
}
