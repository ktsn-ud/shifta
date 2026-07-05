import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

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
  getPayrollSummaryForUser: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getPayrollSummaryForUserMock = jest.mocked(getPayrollSummaryForUser);

function createSummary() {
  return {
    year: 2026,
    workplaces: [
      {
        workplaceId: "workplace-1",
        workplaceName: "勤務先A",
        workplaceColor: "#3366FF",
      },
    ],
    months: [
      {
        month: 1,
        monthKey: "2026-01",
        incomeByWorkplace: [
          {
            workplaceId: "workplace-1",
            taxableAmount: 120000,
            nonTaxableAmount: 5000,
            totalAmount: 125000,
          },
        ],
        hoursByWorkplace: [
          {
            workplaceId: "workplace-1",
            totalWorkHours: 80,
          },
        ],
        totals: {
          taxableAmount: 120000,
          nonTaxableAmount: 5000,
          totalAmount: 125000,
          totalWorkHours: 80,
        },
      },
    ],
    yearlyTotals: {
      byWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: 120000,
          nonTaxableAmount: 5000,
          totalAmount: 125000,
          totalWorkHours: 80,
        },
      ],
      grandTotals: {
        taxableAmount: 120000,
        nonTaxableAmount: 5000,
        totalAmount: 125000,
        totalWorkHours: 80,
      },
    },
  };
}

function createRequest(url: string): Request {
  return { url } as Request;
}

function createUnauthorizedResponse(): Response {
  const headers = new Map<string, string>([
    ["cache-control", "private, no-store, no-cache, must-revalidate"],
    ["content-type", "application/json"],
  ]);

  return {
    status: 401,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      set: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      },
    },
    json: async () => ({ error: "認証が必要です" }),
  } as unknown as Response;
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
    connectionMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalPerf === undefined) {
      delete process.env.SHIFTA_PERF;
      return;
    }

    process.env.SHIFTA_PERF = originalPerf;
  });

  it("year 指定で年次サマリーを返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollSummaryForUserMock.mockResolvedValue(createSummary());

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/payroll/summary?year=2026"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        year: 2026,
        workplaces: expect.any(Array),
        months: expect.any(Array),
      }),
    );
    expect(response.headers.get("server-timing")).toBeNull();
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2026);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("不正な year は 400 を返し service を呼ばない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/payroll/summary?year=1999"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "クエリパラメータが不正です",
      }),
    );
    expect(getPayrollSummaryForUserMock).not.toHaveBeenCalled();
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/payroll/summary?year=2026"),
    );

    expect(response).toBe(unauthorizedResponse);
    expect(getPayrollSummaryForUserMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("SHIFTA_PERF=1 なら expected labels を含む Server-Timing を返す", async () => {
    process.env.SHIFTA_PERF = "1";
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollSummaryForUserMock.mockResolvedValue(createSummary());
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const GET = await loadGet();
      const response = await GET(
        createRequest("http://localhost/api/payroll/summary?year=2026"),
      );
      if (!response) {
        throw new Error("response is undefined");
      }

      expect(response.status).toBe(200);
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("connection;dur="),
      );
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
        expect.stringContaining("getPayrollSummaryForUser;dur="),
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
          "GET /api/payroll/summary:getPayrollSummaryForUser",
          "GET /api/payroll/summary:total",
        ]),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});
