import { fetchJson } from "@/lib/query/fetch-json";
import { UserFacingError } from "@/lib/user-facing-error";

function createMockResponse(input: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}): Response {
  return input as unknown as Response;
}

describe("fetchJson", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("2xxレスポンスをparseして返す", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
        json: async () => ({ value: 42 }),
      }),
    );

    const result = await fetchJson("/api/test", {
      fallbackMessage: "取得に失敗しました。",
      parse: (payload) => {
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== "number") {
          throw new Error("INVALID");
        }

        return { value };
      },
    });

    expect(result).toEqual({ value: 42 });
    expect(fetchMock).toHaveBeenCalledWith("/api/test", undefined);
  });

  it("4xxレスポンスではUserFacingErrorを返す", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse({
        ok: false,
        status: 422,
        json: async () => ({
          details: {
            code: "VALIDATION_FAILED",
          },
        }),
      }),
    );

    await expect(
      fetchJson("/api/test", {
        fallbackMessage: "取得に失敗しました。",
        parse: (payload) => payload,
      }),
    ).rejects.toMatchObject({
      name: "UserFacingError",
      kind: "validation",
      status: 422,
    });
  });

  it("jsonが壊れている場合はserver種別のUserFacingErrorを返す", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    );

    await expect(
      fetchJson("/api/test", {
        fallbackMessage: "取得に失敗しました。",
        parse: (payload) => payload,
      }),
    ).rejects.toMatchObject({
      name: "UserFacingError",
      kind: "server",
    });
  });

  it("AbortErrorはラップせずにそのまま返す", async () => {
    const fetchMock = global.fetch as jest.Mock;
    const abortError = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValue(abortError);

    await expect(
      fetchJson("/api/test", {
        fallbackMessage: "取得に失敗しました。",
        parse: (payload) => payload,
      }),
    ).rejects.toBe(abortError);
  });

  it("parseでUserFacingErrorが投げられた場合はそのまま返す", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      createMockResponse({
        ok: true,
        status: 200,
        json: async () => ({ value: "x" }),
      }),
    );

    await expect(
      fetchJson("/api/test", {
        fallbackMessage: "取得に失敗しました。",
        parse: () => {
          throw new UserFacingError("既知のエラー", "conflict");
        },
      }),
    ).rejects.toMatchObject({
      name: "UserFacingError",
      message: "既知のエラー",
      kind: "conflict",
    });
  });
});
