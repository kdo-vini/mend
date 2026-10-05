import { describe, it, expect } from "vitest";
import { parseFinanceAmount } from "./amount";
describe("currency input", () => {
  it("stores exact cents, accepting comma or point without floating point rounding", () => {
    expect(parseFinanceAmount("19,90")).toBe(1990);
    expect(parseFinanceAmount("0.29")).toBe(29);
    expect(parseFinanceAmount("10")).toBe(1000);
    expect(parseFinanceAmount("")).toBeNull();
  });
  it("rejects ambiguous thousands, negatives, zero and excess precision", () => {
    for (const value of ["1.000,00", "-10", "0", "0.001", "Infinity"]) {
      expect(() => parseFinanceAmount(value)).toThrow();
    }
  });
});
