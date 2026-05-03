import { normalizeShiftPageSearchParams } from "@/lib/shifts/page-search-params";

describe("normalizeShiftPageSearchParams", () => {
  it("preserves supported shift form navigation query values", () => {
    expect(
      normalizeShiftPageSearchParams({
        returnTo: "list",
        date: "2026-05-02",
        month: "2026-05",
      }),
    ).toEqual({
      returnTo: "list",
      initialDate: "2026-05-02",
      returnMonth: "2026-05",
    });
  });

  it("falls back to dashboard return target and ignores array values", () => {
    expect(
      normalizeShiftPageSearchParams({
        returnTo: "dashboard",
        date: ["2026-05-02", "2026-05-03"],
        month: undefined,
      }),
    ).toEqual({
      returnTo: "dashboard",
      initialDate: undefined,
      returnMonth: undefined,
    });
  });
});
