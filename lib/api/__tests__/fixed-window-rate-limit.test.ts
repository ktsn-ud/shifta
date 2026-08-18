import { BULK_SHIFT_CREATE_RATE_LIMIT } from "@/lib/api/bulk-shift-rate-limit";
import { createFixedWindowRateLimiter } from "@/lib/api/fixed-window-rate-limit";

async function loadBulkShiftRateLimitConsumers() {
  let rateLimitModule: typeof import("@/lib/api/bulk-shift-rate-limit");

  await jest.isolateModulesAsync(async () => {
    rateLimitModule = await import("@/lib/api/bulk-shift-rate-limit");
  });

  return rateLimitModule!;
}

describe("createFixedWindowRateLimiter", () => {
  it("configures bulk shift creation for five requests per sixty seconds", () => {
    expect(BULK_SHIFT_CREATE_RATE_LIMIT).toEqual({
      limit: 5,
      windowMs: 60_000,
      maxEntries: 10_000,
    });
  });

  it("keeps bulk create and bulk edit quotas independent in both directions", async () => {
    const { consumeBulkShiftCreateRateLimit, consumeBulkShiftEditRateLimit } =
      await loadBulkShiftRateLimitConsumers();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(consumeBulkShiftCreateRateLimit("user-1")).toEqual({
        allowed: true,
      });
    }
    expect(consumeBulkShiftCreateRateLimit("user-1")).toMatchObject({
      allowed: false,
    });
    expect(consumeBulkShiftEditRateLimit("user-1")).toEqual({
      allowed: true,
    });

    const secondConsumers = await loadBulkShiftRateLimitConsumers();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(secondConsumers.consumeBulkShiftEditRateLimit("user-1")).toEqual({
        allowed: true,
      });
    }
    expect(
      secondConsumers.consumeBulkShiftEditRateLimit("user-1"),
    ).toMatchObject({
      allowed: false,
    });
    expect(secondConsumers.consumeBulkShiftCreateRateLimit("user-1")).toEqual({
      allowed: true,
    });
  });

  it("allows five requests per user and returns a whole-second Retry-After for the sixth", () => {
    let currentTime = 10_000;
    const limiter = createFixedWindowRateLimiter({
      limit: 5,
      windowMs: 60_000,
      now: () => currentTime,
    });

    for (let request = 0; request < 5; request += 1) {
      expect(limiter.consume("user-1")).toEqual({ allowed: true });
    }

    currentTime += 250;
    expect(limiter.consume("user-1")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("keeps users isolated and clears an expired window before accepting a new request", () => {
    let currentTime = 0;
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => currentTime,
    });

    expect(limiter.consume("user-1")).toEqual({ allowed: true });
    expect(limiter.consume("user-1")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("user-2")).toEqual({ allowed: true });

    currentTime = 60_000;
    expect(limiter.consume("user-1")).toEqual({ allowed: true });
    expect(limiter.consume("user-2")).toEqual({ allowed: true });
  });

  it("evicts the oldest active user quota when the public maxEntries bound is reached", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 3,
      now: () => 0,
    });

    expect(limiter.consume("user-1")).toEqual({ allowed: true });
    expect(limiter.consume("user-2")).toEqual({ allowed: true });
    expect(limiter.consume("user-3")).toEqual({ allowed: true });
    expect(limiter.consume("user-2")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    expect(limiter.consume("user-4")).toEqual({ allowed: true });
    expect(limiter.consume("user-2")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("user-3")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("user-4")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("user-1")).toEqual({ allowed: true });
  });

  it("expires a large population of user keys before admitting new independent quotas", () => {
    let currentTime = 0;
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxEntries: 256,
      now: () => currentTime,
    });

    for (let user = 0; user < 200; user += 1) {
      expect(limiter.consume(`expired-user-${user}`)).toEqual({
        allowed: true,
      });
    }

    currentTime = 60_000;
    expect(limiter.consume("fresh-user")).toEqual({ allowed: true });
    expect(limiter.consume("fresh-user")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("expired-user-0")).toEqual({ allowed: true });
  });
});
