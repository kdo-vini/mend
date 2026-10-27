import { describe, expect, it } from "vitest";
import { unwrapPages } from "./transport";

const rowsFor = (total: number) => async (from: number, to: number) => ({
  data: Array.from(
    { length: Math.max(0, Math.min(to + 1, total) - from) },
    (_, i) => from + i,
  ),
  error: null,
});

describe("unwrapPages", () => {
  it("reads every page until a short page", async () => {
    const result = await unwrapPages(rowsFor(1200), { pageSize: 500 });
    expect(result).toHaveLength(1000);
    expect(result[999]).toBe(999);
  });

  it("stops at the hard cap even when more rows exist", async () => {
    const result = await unwrapPages(rowsFor(5000), {
      pageSize: 500,
      cap: 1000,
    });
    expect(result).toHaveLength(1000);
  });

  it("returns all rows below the cap in order", async () => {
    const result = await unwrapPages(rowsFor(730), { pageSize: 500 });
    expect(result).toEqual(Array.from({ length: 730 }, (_, i) => i));
  });
});
