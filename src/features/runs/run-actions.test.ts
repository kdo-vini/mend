import { describe, expect, it } from "vitest";
import type { CodingRun } from "../../types";
import {
  canImplementProposedFix,
  canProposeFromInvestigation,
} from "./run-actions";

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
  decision: "notify",
  researchArtifactId: "artifact-1",
  events: [],
};

describe("run continuations", () => {
  it("offers implementation after a verified proposal completes", () => {
    expect(canImplementProposedFix(proposedFixRun)).toBe(true);
  });

  it("offers proposal and direct implementation after a verified investigation", () => {
    const investigation = { ...proposedFixRun, mode: "Investigate" as const };

    expect(canProposeFromInvestigation(investigation)).toBe(true);
    expect(canImplementProposedFix(investigation)).toBe(true);
  });

  it("allows a manual continuation when automation recommended notification", () => {
    expect(
      canImplementProposedFix({
        ...proposedFixRun,
        decision: "notify",
      }),
    ).toBe(true);
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

  it("does not continue without the reusable research artifact", () => {
    expect(
      canImplementProposedFix({
        ...proposedFixRun,
        researchArtifactId: undefined,
      }),
    ).toBe(false);
  });

  it("does not replace review for an implementation run", () => {
    expect(
      canImplementProposedFix({ ...proposedFixRun, mode: "Implement fix" }),
    ).toBe(false);
  });
});
