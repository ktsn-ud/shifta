import { Suspense, type ReactElement } from "react";
import Loading from "@/app/my/(requires-calendar)/shifts/bulk-edit/loading";
import Page from "@/app/my/(requires-calendar)/shifts/bulk-edit/page";
import { BulkShiftEditLoadingSkeleton } from "@/components/shifts/BulkShiftEditLoadingSkeleton";

jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));
jest.mock("@/lib/api/current-user", () => ({ requireCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { timetableSet: { findMany: jest.fn() } },
}));
jest.mock("@/lib/shifts/month-shifts", () => ({ getMonthShifts: jest.fn() }));

describe("app/my/(requires-calendar)/shifts/bulk-edit loading", () => {
  it("ルート loading と Suspense fallback に専用スケルトンを使う", () => {
    expect(Loading().type).toBe(BulkShiftEditLoadingSkeleton);

    const page = Page({});
    expect(page.type).toBe(Suspense);
    expect((page.props.fallback as ReactElement).type).toBe(
      BulkShiftEditLoadingSkeleton,
    );
  });
});
