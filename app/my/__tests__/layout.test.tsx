import type { ComponentProps, ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import Layout from "@/app/my/layout";
import RequiresCalendarLayout from "@/app/my/(requires-calendar)/layout";
import type { AppSidebar } from "@/components/app-sidebar";
import { requireCurrentUser } from "@/lib/api/current-user";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { auth } from "@/lib/auth";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

const appSidebarMock = jest.fn<
  ReactElement,
  [ComponentProps<typeof AppSidebar>]
>(() => <div data-testid="app-sidebar" />);

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

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));

describe("app/my/layout", () => {
  const authMock = auth as unknown as jest.Mock;
  const redirectMock = jest.mocked(redirect);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("server-side requireCurrentUser() なしで auth() 後に shell を描画する", async () => {
    authMock.mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });

    render(await Layout({ children: <div>child</div> }));

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(appSidebarMock).toHaveBeenCalledTimes(1);

    const [props] = appSidebarMock.mock.calls[0] ?? [];
    expect(props).toEqual(
      expect.objectContaining({
        variant: "inset",
      }),
    );
    expect(props.user).toBeUndefined();
  });

  it("未認証なら /login へ redirect する", async () => {
    authMock.mockResolvedValue(null);

    await Layout({ children: <div>child</div> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});

describe("app/my/(requires-calendar)/layout", () => {
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
});
