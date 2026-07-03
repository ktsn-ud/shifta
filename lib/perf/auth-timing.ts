import { AsyncLocalStorage } from "node:async_hooks";
import { createRequestTiming } from "@/lib/perf/request-timing";

type AuthTiming = ReturnType<typeof createRequestTiming>;

const PERF_ENABLED = process.env.SHIFTA_PERF === "1";

const authTimingStorage = new AsyncLocalStorage<AuthTiming>();

export async function withAuthTiming<T>(
  scope: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  if (!PERF_ENABLED) {
    return callback();
  }

  const timing = createRequestTiming(scope);

  return authTimingStorage.run(timing, async () => {
    try {
      return await callback();
    } finally {
      timing.flushLog();
    }
  });
}

export async function measureAuthTiming<T>(
  label: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  const timing = authTimingStorage.getStore();

  if (!timing) {
    return callback();
  }

  return timing.measure(label, callback);
}
