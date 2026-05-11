import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollPreviewBaselineForUser } from "@/lib/payroll/preview-baseline";

jest.mock("next/server", () => ({
  connection: jest.fn(),
  NextResponse: {
    json: (
      body: unknown,
      init?: {
        status?: number;
        headers?: Record<string, string>;
      },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );

      return {
        status: init?.status ?? 200,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
      };
    },
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/payroll/preview-baseline", () => ({
  getPayrollPreviewBaselineForUser: jest.fn(),
}));

import { GET } from "@/app/api/payroll/preview-baseline/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getPayrollPreviewBaselineForUserMock = jest.mocked(
  getPayrollPreviewBaselineForUser,
);

describe("GET /api/payroll/preview-baseline", () => {
  function createRequest(url: string): Request {
    return { url } as Request;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("未認証時は current-user の response を返す", async () => {
    const unauthorizedResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    } as Response;
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const request = createRequest(
      "http://localhost/api/payroll/preview-baseline?months=2026-06",
    );
    const response = await GET(request);

    expect(response).toBe(unauthorizedResponse);
    expect(getPayrollPreviewBaselineForUserMock).not.toHaveBeenCalled();
  });

  it("months が不正なら 400 を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const request = createRequest(
      "http://localhost/api/payroll/preview-baseline",
    );
    const response = await GET(request);
    if (!response) {
      throw new Error("response is undefined");
    }
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("クエリパラメータが不正です");
    expect(getPayrollPreviewBaselineForUserMock).not.toHaveBeenCalled();
  });

  it("支給月一覧を正規化してサービスへ渡す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollPreviewBaselineForUserMock.mockResolvedValue({
      data: {
        months: [],
      },
    });

    const request = createRequest(
      "http://localhost/api/payroll/preview-baseline?months=2026-07,2026-06,2026-07",
    );
    const response = await GET(request);
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(200);
    expect(getPayrollPreviewBaselineForUserMock).toHaveBeenCalledWith(
      "user-1",
      ["2026-06", "2026-07"],
    );
  });
});
