import { describe, expect, it } from "vitest";
import { isRunExecutionFailed } from "./run-state";

describe("run execution state", () => {
  it("uses the persisted run status as the failure verdict", () => {
    expect(
      isRunExecutionFailed({
        status: "completed",
        stage: "failed",
        caseStatus: "failed",
      }),
    ).toBe(false);
    expect(isRunExecutionFailed({ status: "failed" })).toBe(true);
  });
});
