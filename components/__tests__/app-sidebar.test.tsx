import type { ForwardedRef, ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppSidebar } from "@/components/app-sidebar";

const usePathnameMock = jest.fn();
const prefetchMock = jest.fn();
const fetchMock = jest.fn();
const mockSetOpenMobile = jest.fn();
let mockIsMobile = false;

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
  type RenderElementProps = Record<string, unknown> & {
    isActive?: boolean;
    tooltip?: ReactNode;
  };

  function renderElement(
    render: ReactElement | undefined,
    { isActive, tooltip, ...domProps }: RenderElementProps,
    children: ReactNode,
  ) {
    void tooltip;

    const resolvedDomProps = {
      ...domProps,
      "data-active": String(Boolean(isActive)),
    };

    if (React.isValidElement(render)) {
      return React.cloneElement(render, resolvedDomProps, children);
    }

    return <button {...resolvedDomProps}>{children}</button>;
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
      isMobile: mockIsMobile,
      setOpenMobile: mockSetOpenMobile,
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
    mockSetOpenMobile.mockReset();
    mockIsMobile = false;
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
    expect(screen.getByRole("link", { name: "一括編集" })).toHaveAttribute(
      "href",
      "/my/shifts/bulk-edit",
    );
  });

  it("一括編集ではシフト管理と一括編集を active にする", () => {
    usePathnameMock.mockReturnValue("/my/shifts/bulk-edit");

    renderWithQueryClient(
      <AppSidebar
        user={{
          name: "Test User",
          email: "test@example.com",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "シフト管理" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: "一括編集" })).toHaveAttribute(
      "data-active",
      "true",
    );
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

    const payrollLink = screen.getByRole("link", { name: "給与管理" });
    fireEvent.mouseEnter(payrollLink);
    fireEvent.focus(payrollLink);

    expect(prefetchMock).toHaveBeenNthCalledWith(1, "/my/summary");
    expect(prefetchMock).toHaveBeenNthCalledWith(2, "/my/summary");
  });

  it("モバイル open 時に header の Shifta リンククリックで sidebar を閉じる", () => {
    mockIsMobile = true;

    renderWithQueryClient(
      <AppSidebar
        user={{
          name: "Test User",
          email: "test@example.com",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: /Shifta/i }));

    expect(mockSetOpenMobile).toHaveBeenCalledWith(false);
  });

  it("fallback 中は静的 nav を表示し active と prefetch handler を持たない", () => {
    const pendingPromise = new Promise<never>(() => {});
    usePathnameMock.mockImplementation(() => {
      throw pendingPromise;
    });

    renderWithQueryClient(
      <AppSidebar
        user={{
          name: "Test User",
          email: "test@example.com",
        }}
      />,
    );

    const payrollLink = screen.getByRole("link", { name: "給与管理" });

    expect(
      screen.getByRole("link", { name: "ダッシュボード" }),
    ).toHaveAttribute("data-active", "false");
    expect(payrollLink).toHaveAttribute("data-active", "false");

    fireEvent.mouseEnter(payrollLink);
    fireEvent.focus(payrollLink);

    expect(prefetchMock).not.toHaveBeenCalled();
  });

  it("footer の current user query 結果を表示する", async () => {
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
    expect(
      screen.getByText("ユーザー情報を更新できません"),
    ).toBeInTheDocument();
  });
});
