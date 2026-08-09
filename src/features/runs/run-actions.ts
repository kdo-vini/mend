import type { CodingRun } from "../../types";

export function canImplementProposedFix(run: CodingRun): boolean {
  return (
    run.status === "completed" &&
    (run.mode === "Propose fix" || run.codingStage === "research") &&
    (run.codingStage !== "research" || Boolean(run.researchArtifactId)) &&
    run.verdict === "confirmed" &&
    (run.decision === "manual_fix" || run.decision === "autofix")
  );
}
