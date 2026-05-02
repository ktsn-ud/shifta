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
