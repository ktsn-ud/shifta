"use client";

type NextPaymentCacheEntry = {
  amount: number;
  expiresAt: number;
};

const nextPaymentCache = new Map<string, NextPaymentCacheEntry>();

export function readNextPaymentCache(cacheKey: string): number | null {
  const cached = nextPaymentCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    nextPaymentCache.delete(cacheKey);
    return null;
  }

  return cached.amount;
}

export function writeNextPaymentCache(
  cacheKey: string,
  amount: number,
  ttlMs: number,
): void {
  nextPaymentCache.set(cacheKey, {
    amount,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearNextPaymentCache(): void {
  nextPaymentCache.clear();
}
