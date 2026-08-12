import { Prisma } from "@/lib/generated/prisma/client";
import {
  decimalToNumber,
  roundCurrency,
  roundHours,
} from "@/lib/payroll/numeric";

describe("decimalToNumber", () => {
  it("number、文字列、Prisma Decimal を number に変換する", () => {
    expect(decimalToNumber(123.45)).toBe(123.45);
    expect(decimalToNumber("67.89")).toBe(67.89);
    expect(decimalToNumber(new Prisma.Decimal("12.34"))).toBe(12.34);
  });

  it.each([
    [null, 0],
    [undefined, 0],
    ["not-a-number", 0],
    [{ toString: (): string => "Infinity" }, 0],
  ])("無効な値 %p では fallback を返す", (value, fallback) => {
    expect(decimalToNumber(value, fallback)).toBe(fallback);
  });

  it("指定した fallback を欠損値と非数値に適用する", () => {
    expect(decimalToNumber(null, 999)).toBe(999);
    expect(decimalToNumber("invalid", 999)).toBe(999);
  });
});

describe("roundCurrency", () => {
  it("1円未満を 0.5 円の境界で四捨五入する", () => {
    expect(roundCurrency(1234.49)).toBe(1234);
    expect(roundCurrency(1234.5)).toBe(1235);
  });
});

describe("roundHours", () => {
  it("時間を小数第2位で 0.005 時間の境界で丸める", () => {
    expect(roundHours(3.124)).toBe(3.12);
    expect(roundHours(3.125)).toBe(3.13);
  });
});
