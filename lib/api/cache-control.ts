import { NextResponse } from "next/server";

export const NO_STORE_PRIVATE = "private, no-store, no-cache, must-revalidate";
export const PRIVATE_SHORT_TTL = "private, max-age=30";

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(new Headers(headers).entries());
}

export function withCacheControl(
  init: ResponseInit = {},
  cacheControl = NO_STORE_PRIVATE,
): ResponseInit {
  return {
    ...init,
    headers: {
      ...normalizeHeaders(init.headers),
      "Cache-Control": cacheControl,
    },
  };
}

export function jsonNoStore<T>(
  body: T,
  init: ResponseInit = {},
): NextResponse<T> {
  return NextResponse.json(body, withCacheControl(init));
}
