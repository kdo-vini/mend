import { describe, expect, it } from "vitest";
import type { CodingRun } from "../../types";
import { selectRun } from "./run-selection";

const runs = [
  { id: "run-current", status: "running" },
  { id: "run-complete", status: "completed" },
] as CodingRun[];

describe("selectRun", () => {
  it("honors a valid deep link and falls back to the first run", () => {
    expect(selectRun(runs, "run-complete")?.id).toBe("run-complete");
    expect(selectRun(runs, "missing")?.id).toBe("run-current");
    expect(selectRun([], "run-current")).toBeNull();
  });
});
