import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  connection: jest.fn(),
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

import { GET } from "@/app/api/shifts/form-bootstrap/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const prismaWorkplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const prismaPayrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const prismaTimetableSetFindManyMock = jest.mocked(
  prisma.timetableSet.findMany,
);

function createRequest(url: string): Request {
  return { url } as Request;
}

describe("GET /api/shifts/form-bootstrap", () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
});
