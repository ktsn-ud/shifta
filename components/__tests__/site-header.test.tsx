import type { ForwardedRef, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "@/components/site-header";

const usePathnameMock = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

jest.mock("next/link", () => {
  const React = jest.requireActual("react") as typeof import("react");

  return {
    __esModule: true,
    default: React.forwardRef(function MockLink(
      {
        href,
        children,
        ...props
      }: {
        href: string;
        children?: ReactNode;
      },
      ref: ForwardedRef<HTMLAnchorElement>,
    ) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      );
    }),
  };
});

jest.mock("@/components/ui/separator", () => ({
  Separator: () => <div data-testid="separator" />,
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button aria-label="sidebar trigger" type="button" />,
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("/my ではダッシュボードのみを現在位置として表示する", () => {
    usePathnameMock.mockReturnValue("/my");

    render(<SiteHeader />);

    expect(screen.getByText("ダッシュボード")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "ダッシュボード" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Shifta")).not.toBeInTheDocument();
  });

  it("/my/shifts/[id]/edit ではシフト編集 breadcrumb を表示する", () => {
    usePathnameMock.mockReturnValue("/my/shifts/shift-1/edit");

    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "ダッシュボード" }),
    ).toHaveAttribute("href", "/my");
    expect(screen.getByRole("link", { name: "シフト管理" })).toHaveAttribute(
      "href",
      "/my/shifts/list",
    );
    expect(screen.getByText("シフト編集")).toBeInTheDocument();
  });

  it("/my/shifts/bulk-edit ではシフト一括編集 breadcrumb を表示する", () => {
    usePathnameMock.mockReturnValue("/my/shifts/bulk-edit");

    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "シフト管理" })).toHaveAttribute(
      "href",
      "/my/shifts/list",
    );
    expect(screen.getByText("シフト一括編集")).toBeInTheDocument();
  });

  it("代表パスでは collapse 付き breadcrumb を表示する", () => {
    usePathnameMock.mockReturnValue(
      "/my/workplaces/workplace-1/timetables/timetable-1/edit",
    );

    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "ダッシュボード" }),
    ).toHaveAttribute("href", "/my");
    expect(screen.getByRole("link", { name: "勤務先管理" })).toHaveAttribute(
      "href",
      "/my/workplaces",
    );
    expect(screen.getByRole("link", { name: "時間割" })).toHaveAttribute(
      "href",
      "/my/workplaces/workplace-1/timetables",
    );
    expect(screen.getByText("時間割編集")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("pathname 解決待ちは fallback breadcrumb として Shifta を表示する", () => {
    const pendingPromise = new Promise<never>(() => {});
    usePathnameMock.mockImplementation(() => {
      throw pendingPromise;
    });

    render(<SiteHeader />);

    expect(screen.getByText("Shifta")).toBeInTheDocument();
    expect(screen.queryByText("More")).not.toBeInTheDocument();
  });
});
