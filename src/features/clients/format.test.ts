import { describe, expect, it } from "vitest";
import { formatMoment, formatUpdated } from "./format";

const now = new Date(2026, 10, 4, 15, 0);

describe("formatUpdated", () => {
  it("says today with the time and yesterday without it", () => {
    expect(formatUpdated(new Date(2026, 10, 4, 9, 42).toISOString(), now)).toBe(
      "hoje, 09:42",
    );
    expect(formatUpdated(new Date(2026, 10, 3, 23, 0).toISOString(), now)).toBe(
      "ontem",
    );
  });

  it("uses a short date otherwise and adds the year across years", () => {
    expect(formatUpdated(new Date(2026, 9, 28, 8, 0).toISOString(), now)).toBe(
      "28 out",
    );
    expect(formatUpdated(new Date(2025, 8, 3, 8, 0).toISOString(), now)).toBe(
      "3 set 2025",
    );
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatUpdated("nope", now)).toBe("");
  });
});

describe("formatMoment", () => {
  it("keeps the time on older days", () => {
    expect(formatMoment(new Date(2026, 9, 28, 8, 5).toISOString(), now)).toBe(
      "28 out, 08:05",
    );
  });
});
