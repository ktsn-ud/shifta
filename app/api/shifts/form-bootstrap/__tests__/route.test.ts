import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
    },
    payrollRule: {
      findMany: jest.fn(),
    },
    timetableSet: {
      findMany: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const prismaWorkplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const prismaPayrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const prismaTimetableSetFindManyMock = jest.mocked(
  prisma.timetableSet.findMany,
);

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
  let routeModule: typeof import("@/app/api/shifts/form-bootstrap/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/form-bootstrap/route");
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

describe("GET /api/shifts/form-bootstrap", () => {
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

  it("GENERAL 勤務先では timetableSets を空配列で返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        userId: "user-1",
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    prismaPayrollRuleFindManyMock.mockResolvedValue([
      {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        baseHourlyWage: 1200,
        holidayAllowanceHourly: 0,
        nightPremiumRate: 0.25,
        overtimePremiumRate: 0.25,
        dailyOvertimeThreshold: 8,
        holidayType: "NONE",
      },
    ] as never);
    prismaTimetableSetFindManyMock.mockResolvedValue([]);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/shifts/form-bootstrap"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    const payload = (await response.json()) as {
      data: {
        selectedWorkplace: { id: string } | null;
        timetableSets: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.data.selectedWorkplace?.id).toBe("workplace-1");
    expect(payload.data.timetableSets).toEqual([]);
    expect(prismaPayrollRuleFindManyMock).toHaveBeenCalledWith({
      where: {
        workplaceId: "workplace-1",
      },
      orderBy: [{ startDate: "desc" }],
    });
    expect(prismaTimetableSetFindManyMock).not.toHaveBeenCalled();
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/shifts/form-bootstrap"),
    );

    expect(response).toBe(unauthorizedResponse);
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(prismaPayrollRuleFindManyMock).not.toHaveBeenCalled();
    expect(prismaTimetableSetFindManyMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("CRAM_SCHOOL 勤務先では timetableSets を変換して返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-2",
        userId: "user-1",
        name: "英語塾A",
        type: "CRAM_SCHOOL",
        color: "#FF6633",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 20,
        payday: 28,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    prismaPayrollRuleFindManyMock.mockResolvedValue([]);
    prismaTimetableSetFindManyMock.mockResolvedValue([
      {
        id: "set-1",
        workplaceId: "workplace-2",
        name: "通常授業",
        sortOrder: 0,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
        timetables: [
          {
            id: "tt-1",
            timetableSetId: "set-1",
            period: 1,
            startTime: new Date("1970-01-01T16:30:00.000Z"),
            endTime: new Date("1970-01-01T17:30:00.000Z"),
          },
        ],
      },
    ] as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest(
        "http://localhost/api/shifts/form-bootstrap?selectedWorkplaceId=workplace-2",
      ),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    const payload = (await response.json()) as {
      data: {
        selectedWorkplace: { id: string } | null;
        timetableSets: Array<{
          id: string;
          items: Array<{
            startTimeLabel: string;
            endTimeLabel: string;
          }>;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.selectedWorkplace?.id).toBe("workplace-2");
    expect(payload.data.timetableSets).toEqual([
      {
        id: "set-1",
        workplaceId: "workplace-2",
        name: "通常授業",
        sortOrder: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
        items: [
          {
            id: "tt-1",
            timetableSetId: "set-1",
            period: 1,
            startTime: "1970-01-01T16:30:00.000Z",
            endTime: "1970-01-01T17:30:00.000Z",
            startTimeLabel: "16:30",
            endTimeLabel: "17:30",
          },
        ],
      },
    ]);
  });

  it("SHIFTA_PERF=1 のとき server-timing ヘッダーを返す", async () => {
    process.env.SHIFTA_PERF = "1";
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        userId: "user-1",
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    prismaPayrollRuleFindManyMock.mockResolvedValue([]);
    prismaTimetableSetFindManyMock.mockResolvedValue([]);

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const GET = await loadGet();
      const response = await GET(
        createRequest("http://localhost/api/shifts/form-bootstrap"),
      );
      if (!response) {
        throw new Error("response is undefined");
      }

      expect(response.status).toBe(200);
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("connection;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("total;dur="),
      );
      expect(response.headers.get("server-timing")).toEqual(
        expect.stringContaining("auth;dur="),
      );
      expect(
        extractPerfLabels(infoSpy, "GET /api/shifts/form-bootstrap"),
      ).toEqual(
        expect.arrayContaining([
          "GET /api/shifts/form-bootstrap:connection",
          "GET /api/shifts/form-bootstrap:auth",
          "GET /api/shifts/form-bootstrap:workplaces",
          "GET /api/shifts/form-bootstrap:payrollRules",
          "GET /api/shifts/form-bootstrap:total",
        ]),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});
