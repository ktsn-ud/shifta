/**
 * @jest-environment node
 */

import { DEFAULT_JSON_BODY_MAX_BYTES, parseJsonBody } from "@/lib/api/http";

type Payload = { name: string };

const payloadSchema = {
  safeParse(input: unknown):
    | { success: true; data: Payload }
    | {
        success: false;
        error: { flatten: () => { fieldErrors: { name: string[] } } };
      } {
    if (
      typeof input === "object" &&
      input !== null &&
      "name" in input &&
      typeof input.name === "string"
    ) {
      return { success: true, data: { name: input.name } };
    }

    return {
      success: false,
      error: {
        flatten: () => ({ fieldErrors: { name: ["Required"] } }),
      },
    };
  },
};

function requestWithBody(
  body: ReadableStream<Uint8Array> | undefined,
  headers?: HeadersInit,
): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("origin", "https://example.test");

  return {
    body,
    headers: requestHeaders,
    method: "POST",
    url: "https://example.test/api/example",
  } as Request;
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function jsonOfExactByteLength(byteLength: number): string {
  const prefix = '{"name":"ok","padding":"';
  const suffix = '"}';

  return `${prefix}${"a".repeat(byteLength - prefix.length - suffix.length)}${suffix}`;
}

async function expectError(
  result: Awaited<ReturnType<typeof parseJsonBody<Payload>>>,
  status: number,
  error: string,
): Promise<void> {
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error("Expected parseJsonBody to return an error response");
  }

  expect(result.response.status).toBe(status);
  await expect(result.response.json()).resolves.toMatchObject({ error });
}

describe("parseJsonBody", () => {
  it("accepts a JSON body exactly at the 1 MiB byte limit", async () => {
    const body = jsonOfExactByteLength(DEFAULT_JSON_BODY_MAX_BYTES);
    expect(new TextEncoder().encode(body)).toHaveLength(
      DEFAULT_JSON_BODY_MAX_BYTES,
    );

    const result = await parseJsonBody(
      requestWithBody(streamFromChunks([new TextEncoder().encode(body)]), {
        "content-length": String(DEFAULT_JSON_BODY_MAX_BYTES),
      }),
      payloadSchema,
    );

    expect(result).toMatchObject({
      success: true,
      data: { name: "ok" },
    });
  });

  it("cancels an oversized Content-Length body without reading it", async () => {
    const read = jest.fn();
    const cancel = jest.fn().mockResolvedValue(undefined);
    const body = {
      cancel,
      getReader: () => ({ read, cancel }),
    } as unknown as ReadableStream<Uint8Array>;

    const result = await parseJsonBody(
      requestWithBody(body, {
        "content-length": String(DEFAULT_JSON_BODY_MAX_BYTES + 1),
      }),
      payloadSchema,
    );

    await expectError(result, 413, "リクエスト本文が大きすぎます");
    expect(read).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps the early 413 response when Content-Length body cancellation fails", async () => {
    const read = jest.fn();
    const cancel = jest.fn().mockRejectedValue(new Error("cancel failed"));
    const body = {
      cancel,
      getReader: () => ({ read, cancel }),
    } as unknown as ReadableStream<Uint8Array>;

    const result = await parseJsonBody(
      requestWithBody(body, {
        "content-length": String(DEFAULT_JSON_BODY_MAX_BYTES + 1),
      }),
      payloadSchema,
    );

    await expectError(result, 413, "リクエスト本文が大きすぎます");
    expect(read).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("accepts a chunked body at or below the limit when Content-Length is absent", async () => {
    const result = await parseJsonBody(
      requestWithBody(
        streamFromChunks([
          new TextEncoder().encode('{"name":'),
          new TextEncoder().encode('"chunked"}'),
        ]),
      ),
      payloadSchema,
    );

    expect(result).toEqual({ success: true, data: { name: "chunked" } });
  });

  it("rejects an oversized stream despite a forged small Content-Length", async () => {
    const result = await parseJsonBody(
      requestWithBody(
        streamFromChunks([new Uint8Array(DEFAULT_JSON_BODY_MAX_BYTES + 1)]),
        { "content-length": "1" },
      ),
      payloadSchema,
    );

    await expectError(result, 413, "リクエスト本文が大きすぎます");
  });

  it("cancels the reader when streamed bytes exceed the limit", async () => {
    let reads = 0;
    const read = jest.fn(async () => {
      reads += 1;
      if (reads === 1) {
        return {
          done: false,
          value: new Uint8Array(DEFAULT_JSON_BODY_MAX_BYTES),
        };
      }
      return { done: false, value: new Uint8Array([1]) };
    });
    const cancel = jest.fn().mockResolvedValue(undefined);
    const body = {
      getReader: () => ({ read, cancel }),
    } as unknown as ReadableStream<Uint8Array>;

    const result = await parseJsonBody(requestWithBody(body), payloadSchema);

    await expectError(result, 413, "リクエスト本文が大きすぎます");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid", "-1"])(
    "measures the actual stream when Content-Length is %s",
    async (contentLength) => {
      const read = jest.fn().mockResolvedValue({
        done: false,
        value: new Uint8Array(DEFAULT_JSON_BODY_MAX_BYTES + 1),
      });
      const cancel = jest.fn().mockResolvedValue(undefined);
      const body = {
        getReader: () => ({ read, cancel }),
      } as unknown as ReadableStream<Uint8Array>;

      const result = await parseJsonBody(
        requestWithBody(body, { "content-length": contentLength }),
        payloadSchema,
      );

      await expectError(result, 413, "リクエスト本文が大きすぎます");
      expect(read).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("returns 400 for invalid UTF-8 without exposing a cacheable response", async () => {
    const result = await parseJsonBody(
      requestWithBody(streamFromChunks([new Uint8Array([0xff])])),
      payloadSchema,
    );

    await expectError(result, 400, "JSON形式が不正です");
    if (!result.success) {
      expect(result.response.headers.get("Cache-Control")).toBe(
        "private, no-store, no-cache, must-revalidate",
      );
    }
  });

  it("returns 400 for malformed JSON", async () => {
    const result = await parseJsonBody(
      requestWithBody(streamFromChunks([new TextEncoder().encode("{invalid")])),
      payloadSchema,
    );

    await expectError(result, 400, "JSON形式が不正です");
  });

  it("rejects CSRF failures before pulling the request body", async () => {
    const read = jest.fn();
    const cancel = jest.fn().mockResolvedValue(undefined);
    const body = {
      getReader: () => ({ read, cancel }),
    } as unknown as ReadableStream<Uint8Array>;
    const request = requestWithBody(body);
    request.headers.delete("origin");

    const result = await parseJsonBody(request, payloadSchema);

    await expectError(result, 403, "CSRF検証に失敗しました");
    expect(read).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps supporting Request-like adapters that only provide text()", async () => {
    const text = jest.fn().mockResolvedValue('{"name":"fallback"}');
    const request = {
      body: undefined,
      headers: new Headers({ origin: "https://example.test" }),
      method: "POST",
      text,
      url: "https://example.test/api/example",
    } as unknown as Request;

    const result = await parseJsonBody(request, payloadSchema);

    expect(result).toEqual({ success: true, data: { name: "fallback" } });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized text() fallback bodies with a private no-store response", async () => {
    const text = jest
      .fn()
      .mockResolvedValue(
        jsonOfExactByteLength(DEFAULT_JSON_BODY_MAX_BYTES + 1),
      );
    const request = {
      body: undefined,
      headers: new Headers({ origin: "https://example.test" }),
      method: "POST",
      text,
      url: "https://example.test/api/example",
    } as unknown as Request;

    const result = await parseJsonBody(request, payloadSchema);

    await expectError(result, 413, "リクエスト本文が大きすぎます");
    expect(text).toHaveBeenCalledTimes(1);
    if (!result.success) {
      expect(result.response.headers.get("Cache-Control")).toBe(
        "private, no-store, no-cache, must-revalidate",
      );
    }
  });
});
