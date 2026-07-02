/**
 * @jest-environment node
 */

async function loadCreateRequestTiming() {
  let requestTimingModule: typeof import("@/lib/perf/request-timing");

  await jest.isolateModulesAsync(async () => {
    requestTimingModule = await import("@/lib/perf/request-timing");
  });

  return requestTimingModule!.createRequestTiming;
}

describe("createRequestTiming", () => {
  const originalPerf = process.env.SHIFTA_PERF;

  beforeEach(() => {
    delete process.env.SHIFTA_PERF;
  });

  afterAll(() => {
    if (originalPerf === undefined) {
      delete process.env.SHIFTA_PERF;
      return;
    }

    process.env.SHIFTA_PERF = originalPerf;
  });

  it("SHIFTA_PERF=1 のとき Server-Timing ヘッダーを生成して付与する", async () => {
    process.env.SHIFTA_PERF = "1";

    const createRequestTiming = await loadCreateRequestTiming();
    const timing = createRequestTiming("GET /api/test");
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      timing.startStep("db query");
      timing.endStep("db query");

      expect(timing.toServerTimingHeader()).toEqual(
        expect.stringMatching(/db-query;dur=\d+\.\d, total;dur=\d+\.\d/),
      );

      const response = new Response(null, {
        headers: {
          "Cache-Control": "private, no-store",
        },
      });

      timing.applyServerTiming(response);

      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("db-query;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("total;dur="),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});
