import { Suspense, type ComponentProps, type ReactElement } from "react";
import BulkShiftPage from "@/app/my/(requires-calendar)/shifts/bulk/page";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";
import { connection } from "next/server";

jest.mock("next/server", () => ({
  connection: jest.fn(),
}));

jest.mock("@/components/shifts/BulkShiftFormLazy", () => ({
  BulkShiftFormLazy: jest.fn(() => <div data-testid="bulk-shift-form" />),
}));

type BulkShiftPageElement = ReactElement<
  ComponentProps<typeof BulkShiftFormLazy>,
  typeof BulkShiftFormLazy
>;

type BulkShiftPageContentElement = ReactElement<
  Record<string, never>,
  () => Promise<BulkShiftPageElement>
>;

describe("app/my/(requires-calendar)/shifts/bulk/page", () => {
  const connectionMock = jest.mocked(connection);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("現在月を一括登録フォームの初期表示月へ渡す", async () => {
    const page = BulkShiftPage();
    expect(page.type).toBe(Suspense);
    const content = page.props.children as BulkShiftPageContentElement;
    const result = await content.type();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(result.type).toBe(BulkShiftFormLazy);
    expect(result.key).toBeNull();
    expect(result.props).toEqual({
      initialMonthInputValue: "2026-07",
      todayDateKey: "2026-07-15",
    });
  });
});
