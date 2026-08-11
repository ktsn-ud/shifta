import { after } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  deleteWorkplaceRouteAction,
  updateWorkplaceRouteAction,
} from "@/lib/actions/workplace-core/workplace";
import { getCachedWorkplaceDetail } from "@/lib/cache/workplace-read-cache";
import { revalidateWorkplaceDomainTags } from "@/lib/cache/revalidate";
import { syncShiftDeletionsAfterWorkplaceDeletion } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

const connectionMock = jest.fn<Promise<void>, []>();

jest.mock("next/server", () => ({
  after: jest.fn(),
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
    $transaction: jest.fn(),
    workplace: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shiftLessonRange: {
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedWorkplaceDetail: jest.fn(),
}));

jest.mock("@/lib/google-calendar/syncStatus", () => ({
  syncShiftDeletionsAfterWorkplaceDeletion: jest.fn(),
}));

const afterMock = jest.mocked(after);
const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getCachedWorkplaceDetailMock = jest.mocked(getCachedWorkplaceDetail);
const revalidateWorkplaceDomainTagsMock = jest.mocked(
  revalidateWorkplaceDomainTags,
);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaWorkplaceFindFirstMock = jest.mocked(prisma.workplace.findFirst);
const prismaWorkplaceUpdateMock = jest.mocked(prisma.workplace.update);
const syncShiftDeletionsAfterWorkplaceDeletionMock = jest.mocked(
  syncShiftDeletionsAfterWorkplaceDeletion,
);

function createRequest(url: string): Request {
  return { url } as Request;
}

function createMutationRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/workplaces/workplace-1",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "sec-fetch-site" ? "same-origin" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
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

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/workplaces/[workplaceId]/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/workplaces/[workplaceId]/route");
  });

  return routeModule!;
}

async function loadGet() {
  return (await loadRouteModule()).GET;
}

describe("GET /api/workplaces/[workplaceId]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
  });

  it("勤務先詳細を counts 付きで返し no-store header を付ける", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getCachedWorkplaceDetailMock.mockResolvedValue({
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: {
        shifts: 2,
        payrollRules: 1,
        timetableSets: 0,
      },
    } as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      {
        params: Promise.resolve({ workplaceId: "workplace-1" }),
      },
    );
    const payload = (await response.json()) as {
      data: {
        id: string;
        _count: {
          shifts: number;
          payrollRules: number;
          timetableSets: number;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.data).toEqual({
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: {
        shifts: 2,
        payrollRules: 1,
        timetableSets: 0,
      },
    });
    expect(getCachedWorkplaceDetailMock).toHaveBeenCalledWith(
      "user-1",
      "workplace-1",
    );
    expect(prismaWorkplaceFindFirstMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("勤務先が見つからないときは 404 を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getCachedWorkplaceDetailMock.mockResolvedValue(null);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/missing"),
      {
        params: Promise.resolve({ workplaceId: "missing" }),
      },
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.error).toBe("勤務先が見つかりません");
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      {
        params: Promise.resolve({ workplaceId: "workplace-1" }),
      },
    );

    expect(response).toBe(unauthorizedResponse);
    expect(getCachedWorkplaceDetailMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("Mutation 用 HTTP export を公開しない", async () => {
    const routeModule = await loadRouteModule();

    expect(routeModule).not.toHaveProperty("POST");
    expect(routeModule).not.toHaveProperty("PUT");
    expect(routeModule).not.toHaveProperty("DELETE");
  });

  it("内部 Route Action は所有外勤務先を更新しない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue(null);
    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "変更後" }),
      { params: Promise.resolve({ workplaceId: "workplace-owned-by-user-2" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(404);
    await expect(response!.json()).resolves.toEqual({
      error: "勤務先が見つかりません",
    });
  });

  it("内部 Route Action は transaction 内の最新 counts と削除対象イベントを取得し、関連データを CASCADE 削除する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      _count: { shifts: 99, payrollRules: 99, timetableSets: 99 },
    } as never);
    const callOrder: string[] = [];
    const deleteLessonRanges = jest.fn().mockImplementation(async () => {
      callOrder.push("shiftLessonRange.deleteMany");
    });
    const deleteWorkplace = jest.fn().mockImplementation(async () => {
      callOrder.push("workplace.delete");
    });
    const findLatest = jest.fn().mockResolvedValue({
      shifts: [{ id: "shift-1", googleEventId: "google-event-1" }],
      _count: {
        shifts: 2,
        payrollRules: 1,
        timetableSets: 3,
        actualPayrolls: 4,
      },
    });
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        workplace: { findFirst: findLatest, delete: deleteWorkplace },
        shiftLessonRange: { deleteMany: deleteLessonRanges },
      } as never),
    );
    const backgroundWarnMock = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    syncShiftDeletionsAfterWorkplaceDeletionMock.mockResolvedValue({
      total: 1,
      failed: 1,
    });

    const response = await deleteWorkplaceRouteAction(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "workplace-1",
        deleted: true,
        relatedCounts: {
          shifts: 2,
          payrollRules: 1,
          timetableSets: 3,
          actualPayrolls: 4,
        },
      },
      sync: expect.objectContaining({ status: "pending", ok: true }),
      warning: "関連データをCASCADE削除しました",
    });
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    expect(findLatest).toHaveBeenCalledWith({
      where: { id: "workplace-1", userId: "user-1" },
      select: {
        shifts: {
          where: { googleEventId: { not: null } },
          select: { id: true, googleEventId: true },
        },
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetableSets: true,
            actualPayrolls: true,
          },
        },
      },
    });
    expect(deleteLessonRanges).toHaveBeenCalledWith({
      where: { timetableSet: { workplaceId: "workplace-1" } },
    });
    expect(deleteWorkplace).toHaveBeenCalledWith({
      where: { id: "workplace-1" },
    });
    expect(callOrder).toEqual([
      "shiftLessonRange.deleteMany",
      "workplace.delete",
    ]);
    expect(afterMock).toHaveBeenCalledTimes(1);
    const registeredBackgroundSync = afterMock.mock.calls[0]?.[0];
    if (typeof registeredBackgroundSync !== "function") {
      throw new Error("Expected workplace deletion background sync");
    }
    await registeredBackgroundSync();
    expect(syncShiftDeletionsAfterWorkplaceDeletionMock).toHaveBeenCalledWith(
      [{ id: "shift-1", googleEventId: "google-event-1" }],
      "user-1",
    );
    expect(backgroundWarnMock).toHaveBeenCalledWith(
      "DELETE /api/workplaces/:id background sync partially failed",
      { total: 1, failed: 1 },
    );
    expect(JSON.stringify(backgroundWarnMock.mock.calls)).not.toContain(
      "user-1",
    );
    expect(JSON.stringify(backgroundWarnMock.mock.calls)).not.toContain(
      "shift-1",
    );
    expect(JSON.stringify(backgroundWarnMock.mock.calls)).not.toContain(
      "google-event-1",
    );
    backgroundWarnMock.mockRestore();
  });

  it("内部 Route Action は actual payroll のみが関連する勤務先削除を同期成功として返し after を登録しない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        workplace: {
          findFirst: jest.fn().mockResolvedValue({
            shifts: [],
            _count: {
              shifts: 0,
              payrollRules: 0,
              timetableSets: 0,
              actualPayrolls: 1,
            },
          }),
          delete: jest.fn(),
        },
        shiftLessonRange: { deleteMany: jest.fn() },
      } as never),
    );

    const response = await deleteWorkplaceRouteAction(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "workplace-1",
        deleted: true,
        relatedCounts: {
          shifts: 0,
          payrollRules: 0,
          timetableSets: 0,
          actualPayrolls: 1,
        },
      },
      sync: expect.objectContaining({ status: "success", ok: true }),
      warning: "関連データをCASCADE削除しました",
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(syncShiftDeletionsAfterWorkplaceDeletionMock).not.toHaveBeenCalled();
  });

  it("内部 Route Action は所有外勤務先を削除せず transaction を開始しない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue(null);

    const response = await deleteWorkplaceRouteAction(
      createRequest(
        "http://localhost/api/workplaces/workplace-owned-by-user-2",
      ),
      {
        params: Promise.resolve({
          workplaceId: "workplace-owned-by-user-2",
        }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "勤務先が見つかりません",
    });
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("内部 Route Action は外部キー競合を安全な 409 エラーとして返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    prismaTransactionMock.mockRejectedValue(
      Object.assign(new Error("foreign key violation"), { code: "P2003" }),
    );

    const response = await deleteWorkplaceRouteAction(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "勤務先の削除中にデータ競合が発生しました",
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("内部 Route Action は transaction 中に勤務先が消えた競合を 409 として返し after を登録しない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        workplace: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never),
    );

    const response = await deleteWorkplaceRouteAction(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "勤務先の削除中にデータ競合が発生しました",
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("内部 Route Action は transaction の予期しない失敗を 500 エラーとして返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    const transactionError = new Error("transaction failed");
    const callOrder: string[] = [];
    let rolledBack = false;
    prismaTransactionMock.mockImplementation(async (callback) => {
      try {
        return await callback({
          workplace: {
            findFirst: jest.fn().mockResolvedValue({
              shifts: [],
              _count: {
                shifts: 0,
                payrollRules: 0,
                timetableSets: 0,
                actualPayrolls: 0,
              },
            }),
            delete: jest.fn().mockImplementation(async () => {
              callOrder.push("workplace.delete");
              throw transactionError;
            }),
          },
          shiftLessonRange: {
            deleteMany: jest.fn().mockImplementation(async () => {
              callOrder.push("shiftLessonRange.deleteMany");
            }),
          },
        } as never);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });
    const consoleErrorMock = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await deleteWorkplaceRouteAction(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "勤務先の削除に失敗しました",
    });
    expect(callOrder).toEqual([
      "shiftLessonRange.deleteMany",
      "workplace.delete",
    ]);
    expect(rolledBack).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "DELETE /api/workplaces/:id failed",
      transactionError,
    );
    consoleErrorMock.mockRestore();
  });

  it("内部 Route Action は所有確認後も不正な入力を DB 更新前に拒否する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "" }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(400);
    await expect(response!.json()).resolves.toEqual(
      expect.objectContaining({ error: "入力値が不正です" }),
    );
  });

  it("core の更新成功は旧 revalidateTag 経路を使わない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    prismaWorkplaceUpdateMock.mockResolvedValue({
      id: "workplace-1",
      name: "変更後",
    } as never);

    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "変更後" }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);
    expect(revalidateWorkplaceDomainTagsMock).not.toHaveBeenCalled();
  });
});
