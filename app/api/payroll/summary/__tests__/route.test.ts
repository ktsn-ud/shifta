import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollSummaryCoreForUser } from "@/lib/payroll/summary";

const connectionMock = jest.fn();

jest.mock("next/server", () => ({
  connection: () => connectionMock(),
  NextResponse: {
    json: (
      body: unknown,
      init?: {
        status?: number;
        headers?: Record<string, string>;
      },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );

      return {
        status: init?.status ?? 200,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
          set: (name: string, value: string) => {
            headers.set(name.toLowerCase(), value);
          },
        },
        json: async () => body,
      };
    },
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/payroll/summary", () => ({
  getPayrollSummaryCoreForUser: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getPayrollSummaryCoreForUserMock = jest.mocked(
  getPayrollSummaryCoreForUser,
);

function createRequest(url: string): Request {
  return { url } as Request;
}

async function loadGet() {
  let routeModule: typeof import("@/app/api/payroll/summary/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/payroll/summary/route");
  });

  return routeModule!.GET;
}

function extractPerfLabels(
  infoSpy: jest.SpiedFunction<typeof console.info>,
  scope: string,
): string[] {
  return infoSpy.mock.calls.flatMap((call) => {
    const payload = call[1];
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "label" in entry &&
        typeof entry.label === "string"
          ? entry.label
          : null,
      )
      .filter(
        (label): label is string => label?.startsWith(`${scope}:`) ?? false,
      );
  });
}

describe("GET /api/payroll/summary", () => {
  const originalPerf = process.env.SHIFTA_PERF;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.SHIFTA_PERF;
  });

  afterAll(() => {
    if (originalPerf === undefined) {
      delete process.env.SHIFTA_PERF;
      return;
    }

    process.env.SHIFTA_PERF = originalPerf;
  });

  it("SHIFTA_PERF 未設定なら既存レスポンスを返し Server-Timing を付けない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollSummaryCoreForUserMock.mockResolvedValue({
      month: "2026-08",
      totalWage: 123456,
      estimatedTotalWage: 123456,
      displayValue: {
        displayAmount: 123456,
        estimatedAmount: 123456,
        actualAmount: null,
        differenceAmount: 0,
        isActualApplied: false,
      },
      actualCoverage: {
        registeredWorkplaceCount: 0,
        totalWorkplaceCount: 0,
        isPartial: false,
        taxableAmount: 0,
        nonTaxableAmount: 0,
        totalAmount: 0,
      },
      totalWorkHours: 8,
      totalNightHours: 0,
      totalOvertimeHours: 0,
      byWorkplace: [],
      confirmedShiftWage: 0,
    });

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/payroll/summary?month=2026-08"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        month: "2026-08",
        totalWage: 123456,
        estimatedTotalWage: 123456,
      }),
    );
    expect(response.headers.get("server-timing")).toBeNull();
    expect(getPayrollSummaryCoreForUserMock).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-08-01T00:00:00.000Z"),
    );
  });

  it("SHIFTA_PERF=1 なら expected labels を含む Server-Timing を返す", async () => {
    process.env.SHIFTA_PERF = "1";
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollSummaryCoreForUserMock.mockResolvedValue({
      month: "2026-08",
      totalWage: 123456,
      estimatedTotalWage: 123456,
      displayValue: {
        displayAmount: 123456,
        estimatedAmount: 123456,
        actualAmount: null,
        differenceAmount: 0,
        isActualApplied: false,
      },
      actualCoverage: {
        registeredWorkplaceCount: 0,
        totalWorkplaceCount: 0,
        isPartial: false,
        taxableAmount: 0,
        nonTaxableAmount: 0,
        totalAmount: 0,
      },
      totalWorkHours: 8,
      totalNightHours: 0,
      totalOvertimeHours: 0,
      byWorkplace: [],
      confirmedShiftWage: 0,
    });
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const GET = await loadGet();
      const response = await GET(
        createRequest("http://localhost/api/payroll/summary?month=2026-08"),
      );
      if (!response) {
        throw new Error("response is undefined");
      }

      expect(response.status).toBe(200);
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("requireCurrentUser;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("auth;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("queryParse;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("service;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("total;dur="),
      );
      expect(extractPerfLabels(infoSpy, "GET /api/payroll/summary")).toEqual(
        expect.arrayContaining([
          "GET /api/payroll/summary:connection",
          "GET /api/payroll/summary:auth",
          "GET /api/payroll/summary:requireCurrentUser",
          "GET /api/payroll/summary:queryParse",
          "GET /api/payroll/summary:service",
          "GET /api/payroll/summary:total",
        ]),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});
