import { updateTag } from "next/cache";
import { requireSessionAndCurrentUser } from "@/lib/api/current-user";
import { createWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplaces";
import {
  deleteWorkplaceRouteAction,
  updateWorkplaceRouteAction,
} from "@/lib/actions/workplace-core/workplace";
import { createPayrollRuleRouteAction } from "@/lib/actions/workplace-core/payroll-rules";
import { deletePayrollRuleRouteAction } from "@/lib/actions/workplace-core/payroll-rule";
import { createTimetableRouteAction } from "@/lib/actions/workplace-core/timetables";
import { updateTimetableRouteAction } from "@/lib/actions/workplace-core/timetable";
import {
  createWorkplaceAction,
  createPayrollRuleAction,
  createTimetableAction,
  deletePayrollRuleAction,
  deleteWorkplaceAction,
  updateWorkplaceAction,
  updateTimetableAction,
} from "@/lib/actions/workplace";
import { buildSuccessSyncResponse } from "@/lib/google-calendar/sync-response";

jest.mock("next/cache", () => ({
  updateTag: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireSessionAndCurrentUser: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/workplaces", () => ({
  createWorkplaceRouteAction: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/workplace", () => ({
  updateWorkplaceRouteAction: jest.fn(),
  deleteWorkplaceRouteAction: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/payroll-rules", () => ({
  createPayrollRuleRouteAction: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/payroll-rule", () => ({
  updatePayrollRuleRouteAction: jest.fn(),
  deletePayrollRuleRouteAction: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/timetables", () => ({
  createTimetableRouteAction: jest.fn(),
}));

jest.mock("@/lib/actions/workplace-core/timetable", () => ({
  updateTimetableRouteAction: jest.fn(),
  deleteTimetableRouteAction: jest.fn(),
}));

const updateTagMock = jest.mocked(updateTag);
const requireSessionAndCurrentUserMock = jest.mocked(
  requireSessionAndCurrentUser,
);
const createWorkplaceRouteActionMock = jest.mocked(createWorkplaceRouteAction);
const updateWorkplaceRouteActionMock = jest.mocked(updateWorkplaceRouteAction);
const deleteWorkplaceRouteActionMock = jest.mocked(deleteWorkplaceRouteAction);
const createPayrollRuleRouteActionMock = jest.mocked(
  createPayrollRuleRouteAction,
);
const deletePayrollRuleRouteActionMock = jest.mocked(
  deletePayrollRuleRouteAction,
);
const createTimetableRouteActionMock = jest.mocked(createTimetableRouteAction);
const updateTimetableRouteActionMock = jest.mocked(updateTimetableRouteAction);

type RouteActionResponse = NonNullable<
  Awaited<ReturnType<typeof createWorkplaceRouteAction>>
>;

function response(payload: unknown, status = 200): RouteActionResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as RouteActionResponse;
}

function rejectedJsonResponse(): RouteActionResponse {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("invalid JSON");
    },
  } as unknown as RouteActionResponse;
}

function authenticatedUser(): void {
  requireSessionAndCurrentUserMock.mockResolvedValue({
    session: {},
    user: { id: "user-1" },
  } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
}

const validWorkplaceSuccess = {
  data: { id: "workplace-1", type: "GENERAL" },
  initialPayrollRule: null,
  sync: buildSuccessSyncResponse(),
};

describe("workplace server actions", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("未認証時は Route Action を呼ばず、既存の error 契約を返す", async () => {
    requireSessionAndCurrentUserMock.mockResolvedValue({
      response: response({ error: "認証が必要です" }, 401),
    } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);

    await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual({
      error: "認証が必要です",
    });

    expect(createWorkplaceRouteActionMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("Route Action の入力検証・所有権エラーは data を返さず tag を更新しない", async () => {
    requireSessionAndCurrentUserMock.mockResolvedValue({
      session: {},
      user: { id: "user-1" },
    } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
    createWorkplaceRouteActionMock.mockResolvedValue(
      response(
        { error: "入力値が不正です", details: { fieldErrors: {} } },
        400,
      ),
    );
    updateWorkplaceRouteActionMock.mockResolvedValue(
      response({ error: "勤務先が見つかりません" }, 404),
    );

    await expect(createWorkplaceAction({ name: "" })).resolves.toEqual({
      error: "入力値が不正です",
      details: { fieldErrors: {} },
    });
    await expect(
      updateWorkplaceAction("workplace-owned-by-another-user", {
        name: "変更後",
      }),
    ).resolves.toEqual({ error: "勤務先が見つかりません" });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it.each([
    ["非 object", null],
    ["data がない", { sync: buildSuccessSyncResponse() }],
    ["sync がない", { data: { id: "workplace-1" } }],
    ["sync が object ではない", { data: { id: "workplace-1" }, sync: null }],
  ])(
    "成功応答の %s は既存の汎用エラーへフォールバックする",
    async (_, payload) => {
      requireSessionAndCurrentUserMock.mockResolvedValue({
        session: {},
        user: { id: "user-1" },
      } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
      createWorkplaceRouteActionMock.mockResolvedValue(response(payload));

      await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual(
        {
          error: "操作に失敗しました",
        },
      );

      expect(updateTagMock).not.toHaveBeenCalled();
    },
  );

  it("各 guard を満たす勤務先・給与ルール・時間割の成功 fixture は維持する", async () => {
    authenticatedUser();
    createWorkplaceRouteActionMock.mockResolvedValue(
      response({
        ...validWorkplaceSuccess,
        initialPayrollRule: { id: "rule-1", workplaceId: "workplace-1" },
      }),
    );
    createPayrollRuleRouteActionMock.mockResolvedValue(
      response({
        data: { id: "rule-1", workplaceId: "workplace-1" },
        warning: null,
        sync: buildSuccessSyncResponse(),
      }),
    );
    createTimetableRouteActionMock.mockResolvedValue(
      response({
        data: [
          { id: "timetable-1", workplaceId: "workplace-1" },
          { id: "timetable-2", workplaceId: "workplace-1" },
        ],
        sync: buildSuccessSyncResponse(),
      }),
    );

    await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual({
      ...validWorkplaceSuccess,
      initialPayrollRule: { id: "rule-1", workplaceId: "workplace-1" },
    });
    await expect(
      createPayrollRuleAction("workplace-1", { startDate: "2026-01-01" }),
    ).resolves.toEqual({
      data: { id: "rule-1", workplaceId: "workplace-1" },
      warning: null,
      sync: buildSuccessSyncResponse(),
    });
    await expect(
      createTimetableAction("workplace-1", { name: "時間割" }),
    ).resolves.toEqual({
      data: [
        { id: "timetable-1", workplaceId: "workplace-1" },
        { id: "timetable-2", workplaceId: "workplace-1" },
      ],
      sync: buildSuccessSyncResponse(),
    });

    expect(updateTagMock).toHaveBeenCalled();
  });

  it.each([
    ["sync が空 object", { ...validWorkplaceSuccess, sync: {} }],
    [
      "sync status が不正",
      {
        ...validWorkplaceSuccess,
        sync: { ...buildSuccessSyncResponse(), status: "complete" },
      },
    ],
    [
      "sync 必須 boolean が不正",
      {
        ...validWorkplaceSuccess,
        sync: { ...buildSuccessSyncResponse(), pending: "false" },
      },
    ],
    [
      "勤務先 DTO の type が欠落",
      {
        ...validWorkplaceSuccess,
        data: { id: "workplace-1" },
      },
    ],
    [
      "initialPayrollRule が不正",
      { ...validWorkplaceSuccess, initialPayrollRule: { id: "rule-1" } },
    ],
  ])(
    "成功応答の %s は共通 error として扱い tag を更新しない",
    async (_, payload) => {
      authenticatedUser();
      createWorkplaceRouteActionMock.mockResolvedValue(response(payload));

      await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual(
        {
          error: "操作に失敗しました",
        },
      );

      expect(updateTagMock).not.toHaveBeenCalled();
    },
  );

  it("error と有効な data/sync が混在する成功 payload は共通 error として扱い tag を更新しない", async () => {
    authenticatedUser();
    createWorkplaceRouteActionMock.mockResolvedValue(
      response({
        ...validWorkplaceSuccess,
        error: "内部エラー",
      }),
    );

    await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual({
      error: "操作に失敗しました",
    });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("action 別 DTO・配列要素・extra の不正な成功応答を共通 error として扱う", async () => {
    authenticatedUser();
    deleteWorkplaceRouteActionMock.mockResolvedValue(
      response({
        data: {
          id: "workplace-1",
          deleted: true,
          relatedCounts: { shifts: 0, payrollRules: 0 },
        },
        warning: null,
        sync: buildSuccessSyncResponse(),
      }),
    );
    createPayrollRuleRouteActionMock.mockResolvedValue(
      response({
        data: { id: "rule-1" },
        warning: { message: "重複", overlappingRuleIds: [1] },
        sync: buildSuccessSyncResponse(),
      }),
    );
    createTimetableRouteActionMock.mockResolvedValue(
      response({
        data: [
          { id: "timetable-1", workplaceId: "workplace-1" },
          { id: "timetable-2" },
        ],
        sync: buildSuccessSyncResponse(),
      }),
    );
    deletePayrollRuleRouteActionMock.mockResolvedValue(
      response({
        data: { id: "rule-1", deleted: false },
        sync: buildSuccessSyncResponse(),
      }),
    );

    await expect(deleteWorkplaceAction("workplace-1")).resolves.toEqual({
      error: "操作に失敗しました",
    });
    await expect(
      createPayrollRuleAction("workplace-1", { startDate: "2026-01-01" }),
    ).resolves.toEqual({ error: "操作に失敗しました" });
    await expect(
      createTimetableAction("workplace-1", { name: "時間割" }),
    ).resolves.toEqual({ error: "操作に失敗しました" });
    await expect(
      deletePayrollRuleAction("workplace-1", "rule-1"),
    ).resolves.toEqual({ error: "操作に失敗しました" });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("response.json の例外を成功扱いせず共通 error を返し tag を更新しない", async () => {
    authenticatedUser();
    createWorkplaceRouteActionMock.mockResolvedValue(rejectedJsonResponse());

    await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual({
      error: "操作に失敗しました",
    });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("error payload は message と details を保持し、message 不正時は既存の汎用エラーへフォールバックする", async () => {
    requireSessionAndCurrentUserMock.mockResolvedValue({
      session: {},
      user: { id: "user-1" },
    } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
    createWorkplaceRouteActionMock
      .mockResolvedValueOnce(
        response(
          {
            error: "入力値が不正です",
            details: { fieldErrors: { name: ["勤務先名は必須です"] } },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        response({ error: 400, details: "metadata" }, 400),
      );

    await expect(createWorkplaceAction({ name: "" })).resolves.toEqual({
      error: "入力値が不正です",
      details: { fieldErrors: { name: ["勤務先名は必須です"] } },
    });
    await expect(createWorkplaceAction({ name: "勤務先A" })).resolves.toEqual({
      error: "操作に失敗しました",
      details: "metadata",
    });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("時間割 Server Action も上限エラーの message と details を保持する", async () => {
    authenticatedUser();
    const details = {
      fieldErrors: { items: ["時間割セットのコマは30件までです。"] },
    };
    createTimetableRouteActionMock.mockResolvedValue(
      response({ error: "入力値が不正です", details }, 400),
    );
    updateTimetableRouteActionMock.mockResolvedValue(
      response({ error: "入力値が不正です", details }, 400),
    );

    await expect(
      createTimetableAction("workplace-1", { name: "通常期", items: [] }),
    ).resolves.toEqual({ error: "入力値が不正です", details });
    await expect(
      updateTimetableAction("workplace-1", "set-1", {
        name: "通常期",
        items: [],
      }),
    ).resolves.toEqual({ error: "入力値が不正です", details });

    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("更新成功後に対象 user/workplace のタグを updateTag し、data と sync を維持する", async () => {
    requireSessionAndCurrentUserMock.mockResolvedValue({
      session: {},
      user: { id: "user-1" },
    } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
    updateWorkplaceRouteActionMock.mockResolvedValue(
      response({
        data: { id: "workplace-1", type: "GENERAL" },
        sync: buildSuccessSyncResponse(),
      }),
    );

    await expect(
      updateWorkplaceAction("workplace-1", { name: "変更後" }),
    ).resolves.toEqual({
      data: { id: "workplace-1", type: "GENERAL" },
      sync: buildSuccessSyncResponse(),
    });

    expect(updateWorkplaceRouteActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
      {
        params: expect.any(Promise),
      },
    );
    await expect(
      updateWorkplaceRouteActionMock.mock.calls[0][1].params,
    ).resolves.toEqual({ workplaceId: "workplace-1" });
    expect(updateTagMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user:user-1:workplaces"],
        ["user:user-1:actual-payroll"],
        ["user:user-1:payroll-snapshot"],
        ["user:user-1:summary"],
        ["user:user-1:payroll-details"],
        ["workplace:workplace-1:detail"],
        ["workplace:workplace-1:payroll-rules"],
        ["workplace:workplace-1:timetables"],
      ]),
    );
  });
});
