export type Semaphore = {
  acquire: () => Promise<() => void>;
};

export class SemaphoreCapacityError extends Error {
  readonly code = "SEMAPHORE_CAPACITY_EXCEEDED";

  constructor() {
    super("Semaphore waiting capacity exceeded");
    this.name = "SemaphoreCapacityError";
  }
}

export function isSemaphoreCapacityError(
  error: unknown,
): error is SemaphoreCapacityError {
  return error instanceof SemaphoreCapacityError;
}

export function createSemaphore(
  maxConcurrency: number,
  maxWaiting = Number.POSITIVE_INFINITY,
): Semaphore {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError("Semaphore concurrency must be a positive integer");
  }
  if (
    (!Number.isInteger(maxWaiting) &&
      maxWaiting !== Number.POSITIVE_INFINITY) ||
    maxWaiting < 0
  ) {
    throw new RangeError(
      "Semaphore waiting capacity must be a non-negative integer",
    );
  }

  let activeCount = 0;
  const waiting: Array<() => void> = [];

  return {
    acquire() {
      return new Promise((resolve, reject) => {
        const grantPermit = () => {
          activeCount += 1;
          let released = false;

          resolve(() => {
            if (released) {
              return;
            }

            released = true;
            activeCount -= 1;
            waiting.shift()?.();
          });
        };

        if (activeCount < maxConcurrency) {
          grantPermit();
          return;
        }

        if (waiting.length >= maxWaiting) {
          reject(new SemaphoreCapacityError());
          return;
        }

        waiting.push(grantPermit);
      });
    },
  };
}
