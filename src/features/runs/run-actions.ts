import type { CodingRun } from "../../types";

export type RunAction =
  | "cancel"
  | "retry"
  | "approve"
  | "reject"
  | "publish"
  | "merge"
  | "deploy"
  | "health";

export type RunUpdateAction = Exclude<RunAction, "retry">;

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

export function authorizedRunActions(run: CodingRun): RunAction[] {
  if (run.caseOnly) return [];
  if (run.status === "queued" || run.status === "running") return ["cancel"];
  if (run.status === "failed") return ["retry"];
  if (run.status === "completed" && run.mode === "Implement fix")
    return ["reject", "approve"];
  if (run.status === "approved" && run.branch && !run.published)
    return ["publish"];
  if (
    run.status === "approved" &&
    run.published &&
    run.pullRequest &&
    !run.mergeSha
  )
    return ["merge"];
  if (
    run.status === "approved" &&
    run.published &&
    (!run.pullRequest || run.mergeSha) &&
    !run.deployed
  )
    return ["deploy"];
  if (
    run.status === "approved" &&
    run.deployed &&
    run.healthStatus !== "healthy"
  )
    return ["health"];
  if (
    !canProposeFromInvestigation(run) &&
    !canImplementProposedFix(run) &&
    (run.status === "completed" ||
      run.status === "canceled" ||
      run.status === "rejected")
  )
    return ["retry"];
  return [];
}

export function canDispatchRunAction(
  run: CodingRun,
  action: RunAction,
  pending: boolean,
): boolean {
  return !pending && authorizedRunActions(run).includes(action);
}
