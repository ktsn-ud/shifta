"use client";

type SummaryCacheEntry<T> = {
  expiresAt: number;
  summary: T;
};

const summaryCache = new Map<string, SummaryCacheEntry<unknown>>();

export function readSummaryCache<T>(cacheKey: string): T | null {
  const cached = summaryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    summaryCache.delete(cacheKey);
    return null;
  }

  return cached.summary as T;
}

export function writeSummaryCache<T>(
  cacheKey: string,
  summary: T,
  ttlMs: number,
): void {
  summaryCache.set(cacheKey, {
    summary,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearSummaryCache(): void {
  summaryCache.clear();
}
