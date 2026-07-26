import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "node:util";

if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
    writable: true,
  });
}

if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", {
    value: TextDecoder,
    configurable: true,
    writable: true,
  });
}

if (typeof globalThis.Request === "undefined") {
  class RequestPolyfill {
    readonly headers: {
      get: (name: string) => string | null;
    };
    readonly method: string;
    readonly url: string;
    private readonly body: string;

    constructor(
      input: string | URL,
      init: {
        body?: unknown;
        headers?: Record<string, string>;
        method?: string;
      } = {},
    ) {
      this.url = String(input);
      this.method = init.method ?? "GET";
      this.body = init.body == null ? "" : String(init.body);
      const headers = new Map(
        Object.entries(init.headers ?? {}).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
      this.headers = {
        get: (name) => headers.get(name.toLowerCase()) ?? null,
      };
    }

    async text(): Promise<string> {
      return this.body;
    }
  }

  Object.defineProperty(globalThis, "Request", {
    value: RequestPolyfill,
    configurable: true,
    writable: true,
  });
}

if (typeof globalThis.Response === "undefined") {
  class ResponsePolyfill {
    readonly headers: {
      get: (name: string) => string | null;
    };
    readonly ok: boolean;
    readonly status: number;
    private readonly body: unknown;

    constructor(
      body?: unknown,
      init: { headers?: Record<string, string>; status?: number } = {},
    ) {
      this.body = body;
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      const headers = new Map(
        Object.entries(init.headers ?? {}).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
      this.headers = {
        get: (name) => headers.get(name.toLowerCase()) ?? null,
      };
    }

    async json(): Promise<unknown> {
      return typeof this.body === "string" ? JSON.parse(this.body) : this.body;
    }

    async text(): Promise<string> {
      return this.body == null ? "" : String(this.body);
    }
  }

  Object.defineProperty(globalThis, "Response", {
    value: ResponsePolyfill,
    configurable: true,
    writable: true,
  });
}

if (
  typeof globalThis.PointerEvent === "undefined" &&
  typeof globalThis.MouseEvent !== "undefined"
) {
  class PointerEventPolyfill extends MouseEvent {}

  Object.defineProperty(globalThis, "PointerEvent", {
    value: PointerEventPolyfill,
    configurable: true,
    writable: true,
  });
}
