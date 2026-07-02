import { Suspense } from "react";
import Layout from "@/app/my/layout";
import RequiresCalendarLayout from "@/app/my/(requires-calendar)/layout";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));

jest.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
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

describe("app/my/layout", () => {
  it("認証取得を Suspense 境界の内側に置く", () => {
    const result = Layout({
      children: <div>child</div>,
    });

    expect(result.type).toBe(Suspense);
    expect(result.props.fallback).toBeTruthy();
  });
});

describe("app/my/(requires-calendar)/layout", () => {
  it("カレンダーガードを Suspense 境界の内側に置く", () => {
    const result = RequiresCalendarLayout({
      children: <div>child</div>,
    });

    expect(result.type).toBe(Suspense);
    expect(result.props.fallback).toBeTruthy();
  });
});
