import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { getCachedPayrollRule } from "@/lib/cache/workplace-read-cache";
import { prisma } from "@/lib/prisma";
import {
  GET as getPayrollRule,
  deletePayrollRuleRouteAction,
  updatePayrollRuleRouteAction,
} from "@/lib/actions/workplace-core/payroll-rule";
import { createPayrollRuleRouteAction } from "@/lib/actions/workplace-core/payroll-rules";

jest.mock("next/server", () => ({
  connection: jest.fn(),
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) =>
      new Response(JSON.stringify(body), {
        status: init?.status,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/workplace", () => ({
  requireOwnedWorkplace: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedPayrollRule: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    payrollRule: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const getCachedPayrollRuleMock = jest.mocked(getCachedPayrollRule);
const prismaTransactionMock = prisma.$transaction as unknown as jest.Mock;
const payrollRuleCreateMock = jest.mocked(prisma.payrollRule.create);
const payrollRuleDeleteMock = jest.mocked(prisma.payrollRule.delete);
const payrollRuleFindFirstMock = jest.mocked(prisma.payrollRule.findFirst);
const payrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const payrollRuleUpdateMock = jest.mocked(prisma.payrollRule.update);

const workplaceId = "workplace-1";
const ruleId = "rule-1";

function createRequest(body: unknown): Request {
  return {
    method: "POST",
    url: `http://localhost/api/workplaces/${workplaceId}/payroll-rules`,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function payrollRuleInput(overrides: Record<string, unknown> = {}) {
  return {
    startDate: "2026-04-01",
    endDate: null,
    baseHourlyWage: 1200,
    holidayAllowanceHourly: 100,
    nightPremiumRate: 0.25,
    overtimePremiumRate: 0.5,
    dailyOvertimeThreshold: 8,
    holidayType: "WEEKEND",
    ...overrides,
  };
}

function payrollRule(id = ruleId) {
  return {
    id,
    workplaceId,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: null,
    baseHourlyWage: "1200",
    holidayAllowanceHourly: "100",
    nightPremiumRate: "0.25",
    overtimePremiumRate: "0.5",
    dailyOvertimeThreshold: "8",
    holidayType: "WEEKEND",
  };
}

function payrollRuleDto(id = ruleId) {
  return {
    ...payrollRule(id),
    startDate: "2026-04-01T00:00:00.000Z",
  };
}

function createContext(id = ruleId) {
  return {
    params: Promise.resolve({ workplaceId, id }),
  };
}

function createTransactionClient() {
  return {
    payrollRule: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

async function payload(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function requireResponse(response: Response | undefined): Response {
  if (!response) {
    throw new Error("payroll rule route did not return a response");
  }

  return response;
}

async function runRuleMutation(
  operation: "update" | "delete",
): Promise<Response | undefined> {
  if (operation === "update") {
    return updatePayrollRuleRouteAction(
      createRequest(payrollRuleInput()),
      createContext(),
    );
  }

  return deletePayrollRuleRouteAction(
    createRequest(undefined),
    createContext(),
  );
}

function expectNoPayrollRuleDatabaseAccess() {
  expect(prismaTransactionMock).not.toHaveBeenCalled();
  expect(payrollRuleCreateMock).not.toHaveBeenCalled();
  expect(payrollRuleDeleteMock).not.toHaveBeenCalled();
  expect(payrollRuleFindFirstMock).not.toHaveBeenCalled();
  expect(payrollRuleFindManyMock).not.toHaveBeenCalled();
  expect(payrollRuleUpdateMock).not.toHaveBeenCalled();
}

describe("payroll rule core mutations", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
  });

  it("returns the current-user response before checking workplace ownership", async () => {
    const unauthenticated = new Response(
      JSON.stringify({ error: "未認証です" }),
      { status: 401 },
    );
    requireCurrentUserMock.mockResolvedValue({
      response: unauthenticated,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const response = requireResponse(
      await createPayrollRuleRouteAction(createRequest(payrollRuleInput()), {
        params: Promise.resolve({ workplaceId }),
      }),
    );

    expect(response).toBe(unauthenticated);
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("returns the ownership response without accessing a non-owned workplace", async () => {
    const forbidden = new Response(
      JSON.stringify({ error: "勤務先が見つかりません" }),
      { status: 404 },
    );
    requireOwnedWorkplaceMock.mockResolvedValue({
      response: forbidden,
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);

    const response = requireResponse(
      await createPayrollRuleRouteAction(createRequest(payrollRuleInput()), {
        params: Promise.resolve({ workplaceId }),
      }),
    );

    expect(response).toBe(forbidden);
    expect(requireOwnedWorkplaceMock).toHaveBeenCalledWith(
      workplaceId,
      "user-1",
    );
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an invalid required field",
      payrollRuleInput({ baseHourlyWage: 0 }),
      "入力値が不正です",
    ],
    [
      "a non-calendar date",
      payrollRuleInput({ startDate: "2026-02-29" }),
      "日付の形式が不正です",
    ],
    [
      "an end date equal to its start date",
      payrollRuleInput({ endDate: "2026-04-01" }),
      "endDate は startDate より後の日付にしてください",
    ],
  ])("rejects %s before starting a transaction", async (_, input, error) => {
    const response = requireResponse(
      await createPayrollRuleRouteAction(createRequest(input), {
        params: Promise.resolve({ workplaceId }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(payload(response)).resolves.toMatchObject({ error });
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("uses its transaction client to close an open rule and create the requested DTO", async () => {
    const tx = createTransactionClient();
    const input = payrollRuleInput({ endDate: "2026-05-01" });
    const createdRule = {
      ...payrollRule(),
      endDate: new Date("2026-05-01T00:00:00.000Z"),
    };
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback(tx as never),
    );
    tx.payrollRule.findFirst.mockResolvedValue({
      id: "open-rule",
    });
    tx.payrollRule.findMany.mockResolvedValue([
      { id: "overlap-a" },
      { id: "overlap-b" },
    ]);
    tx.payrollRule.create.mockResolvedValue(createdRule);

    const response = requireResponse(
      await createPayrollRuleRouteAction(createRequest(input), {
        params: Promise.resolve({ workplaceId }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(payload(response)).resolves.toEqual({
      data: {
        ...payrollRuleDto(),
        endDate: "2026-05-01T00:00:00.000Z",
      },
      sync: {
        status: "success",
        ok: true,
        pending: false,
        errorMessage: null,
        errorCode: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
      warning: {
        message: "同一勤務先内で適用期間が重複しています",
        overlappingRuleIds: ["overlap-a", "overlap-b"],
      },
    });
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    expect(tx.payrollRule.update).toHaveBeenCalledWith({
      where: { id: "open-rule" },
      data: { endDate: new Date("2026-04-01T00:00:00.000Z") },
    });
    expect(tx.payrollRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workplaceId,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2026-05-01T00:00:00.000Z"),
        baseHourlyWage: "1200",
      }),
    });
    expect(tx.payrollRule.findMany).toHaveBeenCalledWith({
      where: {
        workplaceId,
        startDate: { lt: new Date("2026-05-01T00:00:00.000Z") },
        OR: [
          { endDate: null },
          { endDate: { gt: new Date("2026-04-01T00:00:00.000Z") } },
        ],
      },
      select: { id: true },
    });
    expect(payrollRuleUpdateMock).not.toHaveBeenCalled();
    expect(payrollRuleCreateMock).not.toHaveBeenCalled();
    expect(payrollRuleFindFirstMock).not.toHaveBeenCalled();
    expect(payrollRuleFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a server error when a transactional rule create fails", async () => {
    const tx = createTransactionClient();
    prismaTransactionMock.mockImplementation(async (callback) => {
      if (typeof callback !== "function") {
        throw new Error("expected interactive transaction callback");
      }
      return callback(tx as never);
    });
    tx.payrollRule.findFirst.mockResolvedValue({
      id: "open-rule",
    });
    tx.payrollRule.findMany.mockResolvedValue([]);
    tx.payrollRule.create.mockRejectedValue(new Error("database failure"));

    const response = requireResponse(
      await createPayrollRuleRouteAction(createRequest(payrollRuleInput()), {
        params: Promise.resolve({ workplaceId }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(payload(response)).resolves.toEqual({
      error: "給与ルールの作成に失敗しました",
    });
    expect(tx.payrollRule.update).toHaveBeenCalledTimes(1);
    expect(tx.payrollRule.create).toHaveBeenCalledTimes(1);
    expect(payrollRuleUpdateMock).not.toHaveBeenCalled();
    expect(payrollRuleCreateMock).not.toHaveBeenCalled();
    expect(payrollRuleFindFirstMock).not.toHaveBeenCalled();
    expect(payrollRuleFindManyMock).not.toHaveBeenCalled();
  });

  it.each(["update", "delete"] as const)(
    "%s returns the current-user response before any payroll rule lookup or write",
    async (operation) => {
      const unauthenticated = new Response(
        JSON.stringify({ error: "未認証です" }),
        { status: 401 },
      );
      requireCurrentUserMock.mockResolvedValue({
        response: unauthenticated,
      } as Awaited<ReturnType<typeof requireCurrentUser>>);

      const response = requireResponse(await runRuleMutation(operation));

      expect(response).toBe(unauthenticated);
      expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
      expectNoPayrollRuleDatabaseAccess();
    },
  );

  it.each(["update", "delete"] as const)(
    "%s returns the ownership response before any payroll rule lookup or write",
    async (operation) => {
      const forbidden = new Response(
        JSON.stringify({ error: "勤務先が見つかりません" }),
        { status: 404 },
      );
      requireOwnedWorkplaceMock.mockResolvedValue({
        response: forbidden,
      } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);

      const response = requireResponse(await runRuleMutation(operation));

      expect(response).toBe(forbidden);
      expect(requireOwnedWorkplaceMock).toHaveBeenCalledWith(
        workplaceId,
        "user-1",
      );
      expectNoPayrollRuleDatabaseAccess();
    },
  );

  it("uses exclusive overlap predicates when updating a bounded rule", async () => {
    payrollRuleFindFirstMock.mockResolvedValue(payrollRule() as never);
    payrollRuleFindManyMock.mockResolvedValue([{ id: "other-rule" }] as never);
    payrollRuleUpdateMock.mockResolvedValue(payrollRule() as never);
    const input = payrollRuleInput({ endDate: "2026-05-01" });

    const response = requireResponse(
      await updatePayrollRuleRouteAction(createRequest(input), createContext()),
    );

    expect(response.status).toBe(200);
    await expect(payload(response)).resolves.toMatchObject({
      data: { id: ruleId, workplaceId },
      warning: {
        overlappingRuleIds: ["other-rule"],
      },
    });
    expect(payrollRuleFindManyMock).toHaveBeenCalledWith({
      where: {
        workplaceId,
        id: { not: ruleId },
        startDate: { lt: new Date("2026-05-01T00:00:00.000Z") },
        OR: [
          { endDate: null },
          { endDate: { gt: new Date("2026-04-01T00:00:00.000Z") } },
        ],
      },
      select: { id: true },
    });
    expect(payrollRuleUpdateMock).toHaveBeenCalledWith({
      where: { id: ruleId },
      data: expect.objectContaining({
        endDate: new Date("2026-05-01T00:00:00.000Z"),
        dailyOvertimeThreshold: "8",
      }),
    });
  });

  it.each([
    [
      "a non-calendar date",
      payrollRuleInput({ endDate: "2026-04-31" }),
      "日付の形式が不正です",
    ],
    [
      "an end date before its start date",
      payrollRuleInput({ endDate: "2026-03-31" }),
      "endDate は startDate より後の日付にしてください",
    ],
  ])(
    "rejects an update with %s before finding overlaps or writing",
    async (_, input, error) => {
      payrollRuleFindFirstMock.mockResolvedValue(payrollRule() as never);

      const response = requireResponse(
        await updatePayrollRuleRouteAction(
          createRequest(input),
          createContext(),
        ),
      );

      expect(response.status).toBe(400);
      await expect(payload(response)).resolves.toMatchObject({ error });
      expect(payrollRuleFindManyMock).not.toHaveBeenCalled();
      expect(payrollRuleUpdateMock).not.toHaveBeenCalled();
    },
  );

  it("returns not found for an owned workplace when the requested detail rule does not exist", async () => {
    getCachedPayrollRuleMock.mockResolvedValue(null);

    const response = requireResponse(
      await getPayrollRule(new Request("http://localhost"), createContext()),
    );

    expect(response.status).toBe(404);
    await expect(payload(response)).resolves.toEqual({
      error: "給与ルールが見つかりません",
    });
    expect(getCachedPayrollRuleMock).toHaveBeenCalledWith(
      "user-1",
      workplaceId,
      ruleId,
    );
  });

  it("does not delete a rule that is not found within the owned workplace", async () => {
    payrollRuleFindFirstMock.mockResolvedValue(null);

    const response = requireResponse(
      await deletePayrollRuleRouteAction(
        createRequest(undefined),
        createContext(),
      ),
    );

    expect(response.status).toBe(404);
    await expect(payload(response)).resolves.toEqual({
      error: "給与ルールが見つかりません",
    });
    expect(payrollRuleDeleteMock).not.toHaveBeenCalled();
  });

  it("deletes an owned existing rule and returns the deletion DTO", async () => {
    payrollRuleFindFirstMock.mockResolvedValue(payrollRule() as never);
    payrollRuleDeleteMock.mockResolvedValue(payrollRule() as never);

    const response = requireResponse(
      await deletePayrollRuleRouteAction(
        createRequest(undefined),
        createContext(),
      ),
    );

    expect(response.status).toBe(200);
    await expect(payload(response)).resolves.toMatchObject({
      data: { id: ruleId, deleted: true },
      sync: { status: "success", ok: true },
    });
    expect(payrollRuleDeleteMock).toHaveBeenCalledWith({
      where: { id: ruleId },
    });
  });
});
