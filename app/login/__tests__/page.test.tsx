import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginContent } from "@/app/login/page";
import { GOOGLE_TOKEN_EXPIRED_REASON } from "@/lib/google-calendar/constants";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/components/auth/login-button", () => ({
  LogIn: ({ label }: { label?: string }) => (
    <button type="button">{label ?? "Google でログイン"}</button>
  ),
}));

describe("app/login/page", () => {
  const redirectMock = jest.mocked(redirect);
  const authMock = auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("ログイン済みなら /my へ redirect する", async () => {
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    authMock.mockResolvedValue({
      user: { email: "user@example.com" },
    });

    await expect(
      LoginContent({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/my");
  });

  it("未ログインなら通常のログインカードを返す", async () => {
    authMock.mockResolvedValue(null);

    const result = await LoginContent({
      searchParams: Promise.resolve({}),
    });

    render(result);

    expect(screen.getByText("Shifta へようこそ")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Google でログイン" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Google 連携の再ログインが必要です"),
    ).not.toBeInTheDocument();
  });

  it("token expired reason のとき再ログイン文言を表示する", async () => {
    authMock.mockResolvedValue(null);

    const result = await LoginContent({
      searchParams: Promise.resolve({
        reason: GOOGLE_TOKEN_EXPIRED_REASON,
      }),
    });

    render(result);

    expect(
      screen.getByText("Google 連携の再ログインが必要です"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("連携トークンの期限切れにより、再認証が必要です。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Google で再ログイン" }),
    ).toBeInTheDocument();
  });
});
