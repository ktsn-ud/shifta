type RateLimitEntry = {
  count: number;
  windowEndsAt: number;
  version: number;
};

type ExpiryRecord = {
  key: string;
  windowEndsAt: number;
  version: number;
};

export type FixedWindowRateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

export type FixedWindowRateLimiter = {
  consume: (key: string) => FixedWindowRateLimitResult;
};

type FixedWindowRateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxEntries?: number;
  now?: () => number;
};

/**
 * Creates an in-memory, instance-local fixed-window rate limiter.
 * A factory keeps application limiters independent and makes time-based
 * behavior directly testable without exposing reset hooks in route APIs.
 */
export function createFixedWindowRateLimiter(
  options: FixedWindowRateLimiterOptions,
): FixedWindowRateLimiter {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new RangeError("Rate limit must be a positive integer");
  }

  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new RangeError("Rate limit window must be greater than zero");
  }

  const maxEntries = options.maxEntries ?? 10_000;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError("Rate limit max entries must be a positive integer");
  }

  const entries = new Map<string, RateLimitEntry>();
  let expiryQueue: ExpiryRecord[] = [];
  let expiryQueueHead = 0;
  let nextVersion = 0;
  const now = options.now ?? Date.now;

  function compactExpiryQueue(): void {
    if (expiryQueueHead === expiryQueue.length) {
      expiryQueue = [];
      expiryQueueHead = 0;
      return;
    }

    if (
      expiryQueueHead >= maxEntries &&
      expiryQueueHead * 2 >= expiryQueue.length
    ) {
      expiryQueue = expiryQueue.slice(expiryQueueHead);
      expiryQueueHead = 0;
    }
  }

  function removeExpiredEntries(currentTime: number): void {
    while (expiryQueueHead < expiryQueue.length) {
      const record = expiryQueue[expiryQueueHead];
      if (!record || record.windowEndsAt > currentTime) {
        break;
      }

      expiryQueueHead += 1;
      const entry = entries.get(record.key);
      if (
        entry?.version === record.version &&
        entry.windowEndsAt === record.windowEndsAt
      ) {
        entries.delete(record.key);
      }
    }

    compactExpiryQueue();
  }

  function evictOldestEntry(): void {
    while (expiryQueueHead < expiryQueue.length) {
      const record = expiryQueue[expiryQueueHead];
      expiryQueueHead += 1;
      if (!record) {
        continue;
      }

      const entry = entries.get(record.key);
      if (
        entry?.version === record.version &&
        entry.windowEndsAt === record.windowEndsAt
      ) {
        entries.delete(record.key);
        break;
      }
    }

    compactExpiryQueue();
  }

  function addEntry(key: string, currentTime: number): void {
    if (entries.size >= maxEntries) {
      evictOldestEntry();
    }

    const entry = {
      count: 1,
      windowEndsAt: currentTime + options.windowMs,
      version: nextVersion,
    };
    nextVersion += 1;
    entries.set(key, entry);
    expiryQueue.push({
      key,
      windowEndsAt: entry.windowEndsAt,
      version: entry.version,
    });
  }

  return {
    consume(key) {
      const currentTime = now();
      removeExpiredEntries(currentTime);

      const entry = entries.get(key);
      if (entry) {
        if (entry.count >= options.limit) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((entry.windowEndsAt - currentTime) / 1000),
            ),
          };
        }

        entry.count += 1;
        return { allowed: true };
      }

      addEntry(key, currentTime);
      return { allowed: true };
    },
  };
}
