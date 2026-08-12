import type { CodingRun } from "../../types";

function isVerifiedResearch(run: CodingRun): boolean {
  return (
    run.status === "completed" &&
    run.verdict === "confirmed" &&
    Boolean(run.researchArtifactId)
  );
}

export function canProposeFromInvestigation(run: CodingRun): boolean {
  return isVerifiedResearch(run) && run.mode === "Investigate";
}

export function canImplementProposedFix(run: CodingRun): boolean {
  return (
    isVerifiedResearch(run) &&
    (run.mode === "Investigate" || run.mode === "Propose fix")
  );
}
