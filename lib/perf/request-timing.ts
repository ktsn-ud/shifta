export type RequestTimingStep = {
  label: string;
  durationMs: number;
};

const PERF_ENABLED = process.env.SHIFTA_PERF === "1";

function roundDuration(durationMs: number): number {
  return Number(durationMs.toFixed(1));
}

function toServerTimingMetric(label: string): string {
  const normalized = label
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "step";
}

export function createRequestTiming(scope: string) {
  const startedAt = performance.now();
  const activeSteps = new Map<string, number>();
  const completedSteps: RequestTimingStep[] = [];
  let flushed = false;

  function startStep(label: string): void {
    if (!PERF_ENABLED) {
      return;
    }

    activeSteps.set(label, performance.now());
  }

  function endStep(label: string): void {
    if (!PERF_ENABLED) {
      return;
    }

    const started = activeSteps.get(label);
    if (started === undefined) {
      return;
    }

    activeSteps.delete(label);
    completedSteps.push({
      label,
      durationMs: roundDuration(performance.now() - started),
    });
  }

  async function measure<T>(
    label: string,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    if (!PERF_ENABLED) {
      return callback();
    }

    startStep(label);

    try {
      return await callback();
    } finally {
      endStep(label);
    }
  }

  function getSteps(): RequestTimingStep[] {
    if (!PERF_ENABLED) {
      return [];
    }

    return [
      ...completedSteps,
      {
        label: "total",
        durationMs: roundDuration(performance.now() - startedAt),
      },
    ];
  }

  function toServerTimingHeader(): string | null {
    if (!PERF_ENABLED) {
      return null;
    }

    return getSteps()
      .map(
        ({ label, durationMs }) =>
          `${toServerTimingMetric(label)};dur=${durationMs.toFixed(1)}`,
      )
      .join(", ");
  }

  function flushLog(): void {
    if (!PERF_ENABLED || flushed) {
      return;
    }

    flushed = true;
    console.info(
      "[perf]",
      getSteps().map(({ label, durationMs }) => ({
        label: `${scope}:${label}`,
        durationMs,
      })),
    );
  }

  function applyServerTiming<T extends Response | undefined>(response: T): T {
    if (!PERF_ENABLED || response === undefined) {
      return response;
    }

    const header = toServerTimingHeader();
    if (header) {
      const current = response.headers.get("Server-Timing");
      response.headers.set(
        "Server-Timing",
        current ? `${current}, ${header}` : header,
      );
    }

    flushLog();
    return response;
  }

  return {
    enabled: PERF_ENABLED,
    startStep,
    endStep,
    measure,
    getSteps,
    toServerTimingHeader,
    flushLog,
    applyServerTiming,
  };
}
