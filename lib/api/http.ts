import { NextResponse } from "next/server";

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
    {
      status,
      ...(init?.headers ? { headers: init.headers } : {}),
    },
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

    const raw = await request.text();
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
  } catch {
    return {
      success: false,
      response: jsonError("JSON形式が不正です", 400),
    };
  }
}
