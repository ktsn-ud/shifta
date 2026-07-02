import type { ForwardedRef, ReactElement, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppSidebar } from "@/components/app-sidebar";

const usePathnameMock = jest.fn();
const prefetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    prefetch: prefetchMock,
  }),
}));

jest.mock("next/link", () => {
  const React = jest.requireActual("react") as typeof import("react");

  return {
    __esModule: true,
    default: React.forwardRef(function MockLink(
      {
        href,
        prefetch,
        children,
        ...props
      }: {
        href: string;
        prefetch?: boolean;
        children?: ReactNode;
      },
      ref: ForwardedRef<HTMLAnchorElement>,
    ) {
      return (
        <a ref={ref} href={href} data-prefetch={String(prefetch)} {...props}>
          {children}
        </a>
      );
    }),
  };
});

jest.mock("@/components/nav-user", () => ({
  NavUser: () => <div data-testid="nav-user" />,
}));

jest.mock("@/components/ui/sidebar", () => {
  const React = jest.requireActual("react") as typeof import("react");

  function renderElement(
    render: ReactElement | undefined,
    props: Record<string, unknown>,
    children: ReactNode,
  ) {
    const domProps = { ...props };
    delete domProps.isActive;
    delete domProps.tooltip;

    if (React.isValidElement(render)) {
      return React.cloneElement(render, domProps, children);
    }

    return <button {...domProps}>{children}</button>;
  }

  return {
    Sidebar: ({ children }: { children: ReactNode }) => (
      <div data-testid="sidebar">{children}</div>
    ),
    SidebarContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarFooter: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarGroup: ({ children }: { children: ReactNode }) => (
      <section>{children}</section>
    ),
    SidebarGroupContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarGroupLabel: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarHeader: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
    SidebarMenuButton: ({
      render,
      children,
      ...props
    }: {
      render?: ReactElement;
      children: ReactNode;
    }) => renderElement(render, props, children),
    SidebarMenuItem: ({ children }: { children: ReactNode }) => (
      <li>{children}</li>
    ),
    SidebarMenuSub: ({ children }: { children: ReactNode }) => (
      <ul>{children}</ul>
    ),
    SidebarMenuSubButton: ({
      render,
      children,
      ...props
    }: {
      render?: ReactElement;
      children: ReactNode;
    }) => renderElement(render, props, children),
    SidebarMenuSubItem: ({ children }: { children: ReactNode }) => (
      <li>{children}</li>
    ),
    useSidebar: () => ({
      isMobile: false,
      setOpenMobile: jest.fn(),
    }),
  };
});

describe("AppSidebar", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/my/summary");
    prefetchMock.mockReset();
  });

  it("主要リンクを prefetch=false で生成する", () => {
    render(
      <AppSidebar
        user={{
          name: "Test User",
          email: "test@example.com",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Shifta/i })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
    expect(
      screen.getByRole("link", { name: "ダッシュボード" }),
    ).toHaveAttribute("data-prefetch", "false");
    expect(screen.getByRole("link", { name: "シフト管理" })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
    expect(screen.getByRole("link", { name: "給与管理" })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
    expect(screen.getByRole("link", { name: "シフト一覧" })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
    expect(screen.getByRole("link", { name: "給与サマリー" })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
    expect(
      screen.getByRole("link", { name: "勤務先・ルール" }),
    ).toHaveAttribute("data-prefetch", "false");
  });

  it("hover 時に代表リンクの router.prefetch を呼ぶ", () => {
    render(
      <AppSidebar
        user={{
          name: "Test User",
          email: "test@example.com",
        }}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole("link", { name: "給与管理" }));

    expect(prefetchMock).toHaveBeenCalledWith("/my/summary");
  });
});
