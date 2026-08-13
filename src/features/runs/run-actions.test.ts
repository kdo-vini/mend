import { describe, expect, it } from "vitest";
import type { CodingRun } from "../../types";
import {
  authorizedRunActions,
  canDispatchRunAction,
  canImplementProposedFix,
  canProposeFromInvestigation,
  canRestartRun,
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

describe("authorizedRunActions", () => {
  it("never offers agent actions for a case-only record", () => {
    expect(
      authorizedRunActions({
        ...proposedFixRun,
        id: "case:case-1",
        caseOnly: true,
        status: "running",
      }),
    ).toEqual([]);
    expect(
      authorizedRunActions({
        ...proposedFixRun,
        id: "case:case-1",
        caseOnly: true,
        status: "failed",
      }),
    ).toEqual([]);
  });

  it("returns the existing actions authorized by an agent run state", () => {
    expect(
      authorizedRunActions({ ...proposedFixRun, status: "running" }),
    ).toEqual(["cancel"]);
    expect(
      authorizedRunActions({ ...proposedFixRun, status: "failed" }),
    ).toEqual(["retry"]);
    const implementation = {
      ...proposedFixRun,
      mode: "Implement fix" as const,
    };
    expect(authorizedRunActions(implementation)).toEqual(["reject", "approve"]);
  });

  it("blocks every mutually exclusive decision while that run is pending", () => {
    const implementation = {
      ...proposedFixRun,
      mode: "Implement fix" as const,
    };
    expect(canDispatchRunAction(implementation, "approve", false)).toBe(true);
    expect(canDispatchRunAction(implementation, "approve", true)).toBe(false);
    expect(canDispatchRunAction(implementation, "reject", true)).toBe(false);
  });

  it.each([
    [{ status: "approved", branch: "fix/run-1" }, ["publish"]],
    [
      {
        status: "approved",
        published: true,
        pullRequest: { number: 1, url: "https://example.com/pr/1" },
      },
      ["merge"],
    ],
    [{ status: "approved", published: true }, ["deploy"]],
    [{ status: "approved", published: true, deployed: true }, ["health"]],
  ] as const)(
    "keeps release actions behind their existing gates",
    (patch, expected) => {
      expect(
        authorizedRunActions({
          ...proposedFixRun,
          ...patch,
          status: patch.status,
        }),
      ).toEqual(expected);
    },
  );

  it("preserves retry for terminal agent runs without a continuation", () => {
    expect(
      authorizedRunActions({
        ...proposedFixRun,
        status: "canceled",
        researchArtifactId: undefined,
      }),
    ).toEqual(["retry"]);
    expect(
      authorizedRunActions({
        ...proposedFixRun,
        status: "completed",
        mode: "Investigate",
        verdict: "not_reproduced",
        researchArtifactId: undefined,
      }),
    ).toEqual(["retry"]);
  });

  it("does not replace a verified continuation with retry", () => {
    expect(authorizedRunActions(proposedFixRun)).toEqual([]);
  });
});

describe("desktop secondary retry", () => {
  it("preserves Run again beside terminal implementation and release actions", () => {
    expect(
      canRestartRun({
        ...proposedFixRun,
        mode: "Implement fix",
        status: "completed",
      }),
    ).toBe(true);
    expect(
      canRestartRun({
        ...proposedFixRun,
        status: "approved",
        branch: "fix/run-1",
      }),
    ).toBe(true);
  });

  it("excludes case-only, active, and continuable records", () => {
    expect(canRestartRun({ ...proposedFixRun, caseOnly: true })).toBe(false);
    expect(canRestartRun({ ...proposedFixRun, status: "running" })).toBe(false);
    expect(canRestartRun(proposedFixRun)).toBe(false);
  });
});
