import { updateTag } from "next/cache";
import { requireSessionAndCurrentUser } from "@/lib/api/current-user";
import { createWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplaces";
import { updateWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplace";
import {
  createWorkplaceAction,
  updateWorkplaceAction,
} from "@/lib/actions/workplace";

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

type RouteActionResponse = NonNullable<
  Awaited<ReturnType<typeof createWorkplaceRouteAction>>
>;

function response(
  payload: Record<string, unknown>,
  status = 200,
): RouteActionResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as RouteActionResponse;
}

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

  it("更新成功後に対象 user/workplace のタグを updateTag し、data と sync を維持する", async () => {
    requireSessionAndCurrentUserMock.mockResolvedValue({
      session: {},
      user: { id: "user-1" },
    } as unknown as Awaited<ReturnType<typeof requireSessionAndCurrentUser>>);
    updateWorkplaceRouteActionMock.mockResolvedValue(
      response({
        data: { id: "workplace-1", name: "変更後" },
        sync: { status: "success", pending: false },
      }),
    );

    await expect(
      updateWorkplaceAction("workplace-1", { name: "変更後" }),
    ).resolves.toEqual({
      data: { id: "workplace-1", name: "変更後" },
      sync: { status: "success", pending: false },
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
