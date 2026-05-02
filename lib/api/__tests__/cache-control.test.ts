/**
 * @jest-environment node
 */

import nextConfig from "@/next.config";
import {
  NO_STORE_PRIVATE,
  PRIVATE_SHORT_TTL,
  withCacheControl,
} from "@/lib/api/cache-control";

describe("API Cache-Control policy", () => {
  it("does not apply one broad Cache-Control header to every API route", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/api/:path*",
        }),
      ]),
    );
  });

  it("provides explicit private cache policies for route handlers", () => {
    expect(NO_STORE_PRIVATE).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(PRIVATE_SHORT_TTL).toBe("private, max-age=30");

    expect(withCacheControl({ status: 201 })).toMatchObject({
      status: 201,
      headers: {
        "Cache-Control": NO_STORE_PRIVATE,
      },
    });
  });
});
