import { revalidateTag } from "next/cache";
import {
  revalidateActualPayrollDomainTags,
  revalidateShiftDomainTags,
  revalidateShiftSyncTags,
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

  it("解決済み支給月のシフト更新は該当する月別 payroll snapshot tag だけを再検証する", () => {
    revalidateShiftDomainTags({
      userId: "user-1",
      workplaceId: "workplace-1",
      paymentMonthKeys: ["2026-04", "2026-03", "2026-04"],
    });

    expect(revalidateTagMock.mock.calls).toEqual(
      expect.arrayContaining([
        ["user:user-1:shifts", { expire: 0 }],
        ["user:user-1:actual-payroll", { expire: 0 }],
        ["user:user-1:payroll-snapshot:2026-03", { expire: 0 }],
        ["user:user-1:payroll-snapshot:2026-04", { expire: 0 }],
        ["user:user-1:summary", { expire: 0 }],
        ["user:user-1:payroll-details", { expire: 0 }],
        ["user:user-1:workplaces", { expire: 0 }],
        ["workplace:workplace-1:detail", { expire: 0 }],
      ]),
    );
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      { expire: 0 },
    );
    expect(revalidateTagMock).toHaveBeenCalledTimes(8);
  });

  it("支給月を解決できないシフト更新は broad payroll snapshot tag にフォールバックする", () => {
    revalidateShiftDomainTags({
      userId: "user-1",
      paymentMonthKeys: [],
    });

    expect(revalidateTagMock).toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      { expire: 0 },
    );
  });

  it("同期ステータスだけの更新はシフト tag のみを再検証する", () => {
    revalidateShiftSyncTags({ userId: "user-1" });

    expect(revalidateTagMock.mock.calls).toEqual([
      ["user:user-1:shifts", "max"],
    ]);
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      "max",
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
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/payroll-snapshot:\d{4}-\d{2}$/),
      "max",
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
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/payroll-snapshot:\d{4}-\d{2}$/),
      "max",
    );
  });
});
