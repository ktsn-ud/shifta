import { createFixedWindowRateLimiter } from "@/lib/api/fixed-window-rate-limit";

export const BULK_SHIFT_CREATE_RATE_LIMIT = {
  limit: 5,
  windowMs: 60_000,
  maxEntries: 10_000,
} as const;

const bulkShiftCreateRateLimiter = createFixedWindowRateLimiter(
  BULK_SHIFT_CREATE_RATE_LIMIT,
);

export function consumeBulkShiftCreateRateLimit(userId: string) {
  return bulkShiftCreateRateLimiter.consume(userId);
}
