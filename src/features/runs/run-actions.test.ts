import { describe, expect, it } from "vitest";
import type { CodingRun } from "../../types";
import { canImplementProposedFix } from "./run-actions";

const proposedFixRun: CodingRun = {
  id: "run-1",
  issueId: "issue-1",
  issueIdentifier: "MEND-6",
  mode: "Propose fix",
  status: "completed",
  progress: 100,
  startedAt: "now",
  duration: "01:00",
  summary: "A safe fix was proposed.",
  files: [],
  verdict: "confirmed",
  decision: "manual_fix",
  events: [],
};

describe("canImplementProposedFix", () => {
  it("offers implementation after a confirmed proposal completes", () => {
    expect(canImplementProposedFix(proposedFixRun)).toBe(true);
  });

  it("does not offer implementation for an unconfirmed result", () => {
    expect(
      canImplementProposedFix({
        ...proposedFixRun,
        verdict: "not_reproduced",
        decision: "notify",
      }),
    ).toBe(false);
  });

  it("does not replace review for an implementation run", () => {
    expect(
      canImplementProposedFix({ ...proposedFixRun, mode: "Implement fix" }),
    ).toBe(false);
  });
});
