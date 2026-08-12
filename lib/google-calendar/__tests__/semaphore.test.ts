import {
  createSemaphore,
  isSemaphoreCapacityError,
  SemaphoreCapacityError,
} from "@/lib/google-calendar/semaphore";

describe("Google Calendar sync semaphore", () => {
  it("allows 100 waiting acquires, rejects the next one with an identifiable capacity error, and reuses permits in FIFO order", async () => {
    const semaphore = createSemaphore(3, 100);
    const activePermits = await Promise.all([
      semaphore.acquire(),
      semaphore.acquire(),
      semaphore.acquire(),
    ]);
    const waitingPermits = Array.from({ length: 100 }, (_, index) =>
      semaphore.acquire().then((release) => ({ index, release })),
    );

    const capacityError = await semaphore
      .acquire()
      .catch((error: unknown) => error);
    expect(capacityError).toBeInstanceOf(SemaphoreCapacityError);
    expect(isSemaphoreCapacityError(capacityError)).toBe(true);
    expect((capacityError as SemaphoreCapacityError).code).toBe(
      "SEMAPHORE_CAPACITY_EXCEEDED",
    );

    const permitsToRelease = [...activePermits];
    for (let index = 0; index < waitingPermits.length; index += 1) {
      const release = permitsToRelease.shift();
      if (!release) {
        throw new Error("Expected an active semaphore permit");
      }

      release();
      const waitingPermit = await waitingPermits[index];
      expect(waitingPermit).toMatchObject({ index });
      permitsToRelease.push(waitingPermit.release);
    }

    for (const release of permitsToRelease) {
      release();
    }

    const reusablePermit = await semaphore.acquire();
    reusablePermit();
  });
});
