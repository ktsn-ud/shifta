import { revalidateTag } from "next/cache";
import {
  revalidateActualPayrollDomainTags,
  revalidateShiftDomainTags,
  revalidateWorkplaceDomainTags,
} from "@/lib/cache/revalidate";

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

const revalidateTagMock = jest.mocked(revalidateTag);

describe("cache revalidation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("シフト更新系の再検証に payroll snapshot tag を含める", () => {
    revalidateShiftDomainTags({
      userId: "user-1",
      workplaceId: "workplace-1",
    });

    expect(revalidateTagMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user:user-1:shifts", "max"],
        ["user:user-1:actual-payroll", "max"],
        ["user:user-1:payroll-snapshot", "max"],
        ["user:user-1:summary", "max"],
        ["user:user-1:payroll-details", "max"],
        ["user:user-1:workplaces", "max"],
        ["workplace:workplace-1:detail", "max"],
      ]),
    );
  });

  it("勤務先更新系の再検証に payroll snapshot tag を含める", () => {
    revalidateWorkplaceDomainTags({
      userId: "user-1",
      workplaceId: "workplace-1",
    });

    expect(revalidateTagMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user:user-1:workplaces", "max"],
        ["user:user-1:actual-payroll", "max"],
        ["user:user-1:payroll-snapshot", "max"],
        ["user:user-1:summary", "max"],
        ["user:user-1:payroll-details", "max"],
        ["workplace:workplace-1:detail", "max"],
        ["workplace:workplace-1:payroll-rules", "max"],
        ["workplace:workplace-1:timetables", "max"],
      ]),
    );
  });

  it("実給与更新でも payroll snapshot tag を再検証する", () => {
    revalidateActualPayrollDomainTags({
      userId: "user-1",
    });

    expect(revalidateTagMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user:user-1:actual-payroll", "max"],
        ["user:user-1:payroll-snapshot", "max"],
        ["user:user-1:summary", "max"],
        ["user:user-1:payroll-details", "max"],
      ]),
    );
  });
});
