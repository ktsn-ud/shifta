import { requireCurrentUser } from "@/lib/api/current-user";
import { revalidateActualPayrollDomainTags } from "@/lib/cache/revalidate";
import {
  getActualPayrollEditorForUser,
  type ActualPayrollEditorResult,
} from "@/lib/payroll/actual-editor";
import { prisma } from "@/lib/prisma";

const connectionMock = jest.fn<Promise<void>, []>();

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

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateActualPayrollDomainTags: jest.fn(),
}));

jest.mock("@/lib/payroll/actual-editor", () => ({
  getActualPayrollEditorForUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const revalidateActualPayrollDomainTagsMock = jest.mocked(
  revalidateActualPayrollDomainTags,
);
const getActualPayrollEditorForUserMock = jest.mocked(
  getActualPayrollEditorForUser,
);
const prismaWorkplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const prismaTransactionMock = jest.mocked(prisma.$transaction);

function createRequest(
  url: string,
  init?: {
    body?: string;
    headers?: HeadersInit;
    method?: string;
  },
): Request {
  const headers = new Map(
    Object.entries(init?.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );

  return {
    url,
    method: init?.method ?? "PUT",
    text: async () => init?.body ?? "",
    json: async () => JSON.parse(init?.body ?? ""),
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
  } as Request;
}

function createEditorResult(): ActualPayrollEditorResult {
  return {
    month: "2026-07",
    rows: [
      {
        workplaceId: "workplace-1",
        workplaceName: "勤務先A",
        workplaceColor: "#3366FF",
        periodStartDate: "2026-06-01",
        periodEndDate: "2026-06-30",
        estimatedAmount: 115000,
        taxableAmount: 120000,
        nonTaxableAmount: 5000,
        totalActualAmount: 125000,
        displayAmount: 125000,
        differenceAmount: 10000,
        note: "メモ",
        hasActualPayroll: true,
      },
    ],
  };
}

async function loadPut() {
  let routeModule: typeof import("@/app/api/payroll/actual/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/payroll/actual/route");
  });

  return routeModule!.PUT;
}

describe("PUT /api/payroll/actual", () => {
  const transactionClient = {
    actualPayroll: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindManyMock.mockResolvedValue([
      { id: "workplace-1" },
    ] as never);
    prismaTransactionMock.mockImplementation(
      async (callback) => callback(transactionClient as never) as never,
    );
    getActualPayrollEditorForUserMock.mockResolvedValue(createEditorResult());
  });

  it("malformed JSON は 400 JSON形式が不正です を返す", async () => {
    const PUT = await loadPut();
    const response = await PUT(
      createRequest("http://localhost/api/payroll/actual?month=2026-07", {
        body: "{invalid",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "JSON形式が不正です",
    });
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("schema invalid JSON は 400 を返す", async () => {
    const PUT = await loadPut();
    const response = await PUT(
      createRequest("http://localhost/api/payroll/actual?month=2026-07", {
        body: JSON.stringify({ rows: [{}] }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "入力値が不正です",
      details: expect.any(Object),
    });
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("CSRF invalid は 403 を返す", async () => {
    const PUT = await loadPut();
    const response = await PUT(
      createRequest("http://localhost/api/payroll/actual?month=2026-07", {
        body: JSON.stringify({
          rows: [
            {
              workplaceId: "workplace-1",
              taxableAmount: 100000,
              nonTaxableAmount: 0,
            },
          ],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "CSRF検証に失敗しました",
    });
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("invalid month は 400 を返す", async () => {
    const PUT = await loadPut();
    const response = await PUT(
      createRequest("http://localhost/api/payroll/actual?month=2026-13"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "クエリパラメータが不正です",
      details: expect.any(Object),
    });
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("success path は data wrapper で返し revalidate を呼ぶ", async () => {
    const PUT = await loadPut();
    const response = await PUT(
      createRequest("http://localhost/api/payroll/actual?month=2026-07", {
        body: JSON.stringify({
          rows: [
            {
              workplaceId: "workplace-1",
              taxableAmount: 120000,
              nonTaxableAmount: 5000,
              note: " メモ ",
            },
          ],
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({
      data: createEditorResult(),
    });
    expect(prismaWorkplaceFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
      },
      select: {
        id: true,
      },
    });
    expect(transactionClient.actualPayroll.upsert).toHaveBeenCalledWith({
      where: {
        workplaceId_paymentMonth: {
          workplaceId: "workplace-1",
          paymentMonth: new Date("2026-07-01T00:00:00.000Z"),
        },
      },
      update: {
        taxableAmount: 120000,
        nonTaxableAmount: 5000,
        note: "メモ",
      },
      create: {
        workplaceId: "workplace-1",
        paymentMonth: new Date("2026-07-01T00:00:00.000Z"),
        taxableAmount: 120000,
        nonTaxableAmount: 5000,
        note: "メモ",
      },
    });
    expect(revalidateActualPayrollDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(getActualPayrollEditorForUserMock).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
    );
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });
});
