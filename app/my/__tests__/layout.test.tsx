import type { ComponentProps, ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import Layout from "@/app/my/layout";
import RequiresCalendarLayout from "@/app/my/(requires-calendar)/layout";
import type { AppSidebar } from "@/components/app-sidebar";
import { requireCurrentUser } from "@/lib/api/current-user";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

const appSidebarMock = jest.fn<
  ReactElement,
  [ComponentProps<typeof AppSidebar>]
>(({ user }) => (
  <div
    data-testid="app-sidebar"
    data-user-email={user?.email ?? ""}
    data-user-name={user?.name ?? ""}
  />
));

jest.mock("@/components/app-sidebar", () => ({
  AppSidebar: (props: ComponentProps<typeof AppSidebar>) =>
    appSidebarMock(props),
}));

jest.mock("@/components/site-header", () => ({
  SiteHeader: () => <div data-testid="site-header" />,
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));

describe("app/my/layout", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requireCurrentUser() や auth() に依存せず shell を描画する", () => {
    render(Layout({ children: <div>child</div> }));

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(appSidebarMock).toHaveBeenCalledTimes(1);
    expect(requireCurrentUserMock).not.toHaveBeenCalled();

    const [props] = appSidebarMock.mock.calls[0] ?? [];
    expect(props).toEqual(
      expect.objectContaining({
        variant: "inset",
      }),
    );
    expect(props.user).toBeUndefined();
  });

  it("shell に user 固有値を注入しない", () => {
    render(Layout({ children: <div>child</div> }));

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-user-email",
      "",
    );
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-user-name",
      "",
    );
    expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
    expect(requireCurrentUserMock).not.toHaveBeenCalled();
  });
});

describe("app/my/(requires-calendar)/layout", () => {
  const redirectMock = jest.mocked(redirect);
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const redirectToCalendarSetupIfNeededMock = jest.mocked(
    redirectToCalendarSetupIfNeeded,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requireCurrentUser() を通したうえで受け取った子要素を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        calendarId: "calendar-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    render(await RequiresCalendarLayout({ children: <div>child</div> }));

    expect(screen.getByText("child")).toBeInTheDocument();
    expect(requireCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(redirectToCalendarSetupIfNeededMock).toHaveBeenCalledWith({
      calendarId: "calendar-1",
    });
  });

  it("calendarId 未設定なら calendar setup guard を通す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        calendarId: null,
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    await RequiresCalendarLayout({ children: <div>child</div> });

    expect(redirectToCalendarSetupIfNeededMock).toHaveBeenCalledWith({
      calendarId: null,
    });
  });

  it("未認証なら /login へ redirect する", async () => {
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    requireCurrentUserMock.mockResolvedValue({
      response: {} as Response,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    await expect(
      RequiresCalendarLayout({ children: <div>child</div> }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(redirectToCalendarSetupIfNeededMock).not.toHaveBeenCalled();
  });
});
