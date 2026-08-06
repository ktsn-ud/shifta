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
  {
    searchParams?:
      { month?: string | string[] } | Promise<{ month?: string | string[] }>;
  },
  (props: {
    searchParams?:
      { month?: string | string[] } | Promise<{ month?: string | string[] }>;
  }) => Promise<BulkShiftPageElement>
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

  it("URL の有効な month を一括登録フォームの初期表示月へ渡す", async () => {
    const page = BulkShiftPage({
      searchParams: Promise.resolve({ month: "2026-12" }),
    });
    expect(page.type).toBe(Suspense);
    const content = page.props.children as BulkShiftPageContentElement;
    const result = await content.type(content.props);

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(result.type).toBe(BulkShiftFormLazy);
    expect(result.key).toBe("2026-12");
    expect(result.props).toEqual({
      initialMonthInputValue: "2026-12",
      todayDateKey: "2026-07-15",
    });
  });

  it("不正な month は現在月を初期表示にする", async () => {
    const page = BulkShiftPage({
      searchParams: Promise.resolve({ month: "invalid" }),
    });
    const content = page.props.children as BulkShiftPageContentElement;
    const result = await content.type(content.props);

    expect(result.props.initialMonthInputValue).toBe("2026-07");
  });
});
