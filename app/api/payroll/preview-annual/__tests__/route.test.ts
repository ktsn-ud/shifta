import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollAnnualPreviewForUser } from "@/lib/payroll/preview-annual";

jest.mock("next/server", () => ({
  connection: jest.fn(),
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
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
jest.mock("@/lib/payroll/preview-annual", () => ({
  getPayrollAnnualPreviewForUser: jest.fn(),
}));

import { GET } from "@/app/api/payroll/preview-annual/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getPayrollAnnualPreviewForUserMock = jest.mocked(
  getPayrollAnnualPreviewForUser,
);

describe("GET /api/payroll/preview-annual", () => {
  function createRequest(url: string): Request {
    return { url } as Request;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns the authentication response without reading annual totals", async () => {
    const unauthorizedResponse = { status: 401 } as Response;
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    await expect(
      GET(
        createRequest("http://localhost/api/payroll/preview-annual?years=2026"),
      ),
    ).resolves.toBe(unauthorizedResponse);
    expect(getPayrollAnnualPreviewForUserMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "2026,foo",
    "1999",
    "2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037,2038",
  ])("rejects invalid years query %s", async (years) => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const response = await GET(
      createRequest(
        `http://localhost/api/payroll/preview-annual?years=${years}`,
      ),
    );
    if (!response) throw new Error("response is undefined");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "クエリパラメータが不正です" }),
    );
    expect(getPayrollAnnualPreviewForUserMock).not.toHaveBeenCalled();
  });

  it("passes years to the service and marks annual payroll data no-store", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollAnnualPreviewForUserMock.mockResolvedValue({
      data: {
        years: [
          {
            year: 2026,
            taxableAmount: 120000,
            nonTaxableAmount: 12000,
            totalAmount: 132000,
          },
        ],
        actualPayrollKeys: [
          {
            workplaceId: "workplace-1",
            paymentMonth: "2026-06",
          },
        ],
      },
    });

    const response = await GET(
      createRequest(
        "http://localhost/api/payroll/preview-annual?years=2027,2026,2027",
      ),
    );
    if (!response) throw new Error("response is undefined");

    expect(getPayrollAnnualPreviewForUserMock).toHaveBeenCalledWith(
      "user-1",
      [2026, 2027],
    );
    expect(response.headers.get("cache-control")).toContain(
      "private, no-store",
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        years: [
          {
            year: 2026,
            taxableAmount: 120000,
            nonTaxableAmount: 12000,
            totalAmount: 132000,
          },
        ],
        actualPayrollKeys: [
          {
            workplaceId: "workplace-1",
            paymentMonth: "2026-06",
          },
        ],
      },
    });
  });
});
