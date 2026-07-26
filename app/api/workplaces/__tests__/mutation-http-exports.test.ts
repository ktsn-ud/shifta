jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedPayrollRule: jest.fn(),
  getCachedWorkplaces: jest.fn(),
  getCachedWorkplaceDetail: jest.fn(),
  getCachedPayrollRulesForWorkplace: jest.fn(),
  getCachedTimetableSetsForWorkplace: jest.fn(),
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

import * as workplaces from "@/app/api/workplaces/route";
import * as workplace from "@/app/api/workplaces/[workplaceId]/route";
import * as payrollRules from "@/app/api/workplaces/[workplaceId]/payroll-rules/route";
import * as payrollRule from "@/app/api/workplaces/[workplaceId]/payroll-rules/[id]/route";
import * as timetables from "@/app/api/workplaces/[workplaceId]/timetables/route";

describe("公開中の workplace REST routes", () => {
  it.each([
    ["勤務先一覧", workplaces],
    ["勤務先詳細", workplace],
    ["給与ルール一覧", payrollRules],
    ["給与ルール詳細", payrollRule],
    ["時間割一覧", timetables],
  ])("%s は Mutation HTTP method を公開しない", (_, routeModule) => {
    expect(routeModule).not.toHaveProperty("POST");
    expect(routeModule).not.toHaveProperty("PUT");
    expect(routeModule).not.toHaveProperty("DELETE");
  });

  // 時間割セット詳細の REST endpoint は削除済みで、更新・削除は Server Action のみで行う。
});
