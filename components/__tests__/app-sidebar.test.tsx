import type { ForwardedRef, ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppSidebar } from "@/components/app-sidebar";

const usePathnameMock = jest.fn();
const prefetchMock = jest.fn();
const fetchMock = jest.fn();

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
  NavUser: ({
    user,
  }: {
    user: { name: string; email: string; avatar?: string | null };
  }) => (
    <div data-testid="nav-user">
      <span>{user.name}</span>
      <span>{user.email}</span>
    </div>
  ),
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

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("AppSidebar", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
  });

  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/my/summary");
    prefetchMock.mockReset();
    fetchMock.mockReset();
  });

  it("主要リンクを prefetch=false で生成する", () => {
    renderWithQueryClient(
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
    renderWithQueryClient(
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

  it("user prop がない場合は placeholder を出してから /api/users/me の結果を描画する", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          name: "Fetched User",
          email: "fetched@example.com",
          image: null,
        },
      }),
    });

    renderWithQueryClient(<AppSidebar />);

    expect(
      screen.getByLabelText("ユーザー情報を読み込み中"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("nav-user")).toBeInTheDocument();
    });

    expect(screen.getByText("Fetched User")).toBeInTheDocument();
    expect(screen.getByText("fetched@example.com")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("user 取得に失敗しても NavUser 導線を維持する", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: "ユーザー取得に失敗しました",
      }),
    });

    renderWithQueryClient(<AppSidebar />);

    await waitFor(() => {
      expect(screen.getByTestId("nav-user")).toBeInTheDocument();
    });

    expect(screen.getByText("ユーザー")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("ユーザー情報を更新できません")).toBeInTheDocument();
  });
});
