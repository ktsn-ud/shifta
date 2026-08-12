import { userPayrollSnapshotMonthTag } from "@/lib/cache/tags";

describe("payroll snapshot cache tags", () => {
  it("uses a user-scoped payment-month tag format", () => {
    expect(userPayrollSnapshotMonthTag("user-1", "2026-04")).toBe(
      "user:user-1:payroll-snapshot:2026-04",
    );
  });

  it.each(["2026-4", "26-04", "2026-13", "2026-00", "April 2026"])(
    "rejects an invalid payment month key: %s",
    (monthKey) => {
      expect(() => userPayrollSnapshotMonthTag("user-1", monthKey)).toThrow();
    },
  );
});
