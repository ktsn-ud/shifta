import { NextResponse } from "next/server";
import { withCacheControl } from "@/lib/api/cache-control";

type SchemaValidationSuccess<T> = {
  success: true;
  data: T;
};

type SchemaValidationFailure = {
  success: false;
  error: {
    flatten: () => unknown;
  };
};

type SchemaValidator<T> = {
  safeParse: (
    input: unknown,
  ) => SchemaValidationSuccess<T> | SchemaValidationFailure;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const DEFAULT_JSON_BODY_MAX_BYTES = 1024 * 1024;

class JsonBodyTooLargeError extends Error {}

function contentLengthExceedsLimit(
  contentLength: string | null,
  maxBytes: number,
): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength)) {
    return false;
  }

  return BigInt(contentLength) > BigInt(maxBytes);
}

async function cancelUnconsumedRequestBody(request: Request): Promise<void> {
  const body = request.body;
  if (!body) {
    return;
  }

  await body.cancel().catch(() => undefined);
}

async function readJsonBodyBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();

  // Route tests and Server Action adapters can provide a Request-like object
  // with text() but without a readable stream.
  if (!reader) {
    const bytes = new TextEncoder().encode(await request.text());
    if (bytes.byteLength > maxBytes) {
      throw new JsonBodyTooLargeError();
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new JsonBodyTooLargeError();
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export function jsonError(
  message: string,
  status: number,
  details?: unknown,
  init?: {
    headers?: HeadersInit;
  },
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    withCacheControl({
      status,
      headers: init?.headers,
    }),
  );
}

export function verifyMutationRequest(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return null;
  }

  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin) {
    if (origin === expectedOrigin) {
      return null;
    }

    return jsonError("不正なオリジンからのリクエストです", 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") {
    return null;
  }

  return jsonError("CSRF検証に失敗しました", 403);
}

export async function parseJsonBody<T>(
  request: Request,
  schema: SchemaValidator<T>,
): Promise<
  { success: true; data: T } | { success: false; response: NextResponse }
> {
  try {
    const csrfError = verifyMutationRequest(request);
    if (csrfError) {
      return {
        success: false,
        response: csrfError,
      };
    }

    if (
      contentLengthExceedsLimit(
        request.headers.get("content-length"),
        DEFAULT_JSON_BODY_MAX_BYTES,
      )
    ) {
      await cancelUnconsumedRequestBody(request);
      return {
        success: false,
        response: jsonError("リクエスト本文が大きすぎます", 413),
      };
    }

    const raw = new TextDecoder("utf-8", { fatal: true }).decode(
      await readJsonBodyBytes(request, DEFAULT_JSON_BODY_MAX_BYTES),
    );
    const parsed = schema.safeParse(
      raw.trim().length === 0 ? {} : JSON.parse(raw),
    );

    if (!parsed.success) {
      return {
        success: false,
        response: jsonError("入力値が不正です", 400, parsed.error.flatten()),
      };
    }

    return { success: true, data: parsed.data };
  } catch (error) {
    if (error instanceof JsonBodyTooLargeError) {
      return {
        success: false,
        response: jsonError("リクエスト本文が大きすぎます", 413),
      };
    }

    return {
      success: false,
      response: jsonError("JSON形式が不正です", 400),
    };
  }
}
