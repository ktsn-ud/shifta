import { Suspense, type ReactElement, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/api/current-user";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

describe("app/my/calendar-setup/layout", () => {
  const redirectMock = jest.mocked(redirect);
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  type CalendarSetupContentElement = ReactElement<
    { children: ReactNode },
    (props: { children: ReactNode }) => Promise<ReactNode>
  >;

  function contentOf(layout: ReactElement<{ children?: ReactNode }>) {
    expect(layout.type).toBe(Suspense);
    return layout.props.children as CalendarSetupContentElement;
  }

  it("calendarId が設定済みなら /my へ redirect する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        calendarId: "calendar-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { default: CalendarSetupLayout } =
      await import("@/app/my/calendar-setup/layout");

    const content = contentOf(
      CalendarSetupLayout({ children: <div>child</div> }),
    );
    await content.type(content.props);

    expect(redirectMock).toHaveBeenCalledWith("/my");
  });

  it("calendarId が未設定なら子要素を表示する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        calendarId: null,
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { default: CalendarSetupLayout } =
      await import("@/app/my/calendar-setup/layout");

    const content = contentOf(
      CalendarSetupLayout({ children: <div>child</div> }),
    );
    const result = await content.type(content.props);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("未認証なら /login へ redirect する", async () => {
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    requireCurrentUserMock.mockResolvedValue({
      response: {} as Response,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { default: CalendarSetupLayout } =
      await import("@/app/my/calendar-setup/layout");

    await expect(
      (async () => {
        const content = contentOf(
          CalendarSetupLayout({ children: <div>child</div> }),
        );
        await content.type(content.props);
      })(),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
