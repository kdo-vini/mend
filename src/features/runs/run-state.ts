import type { CodingRun } from "../../types";

export function isRunExecutionFailed(
  run: Pick<CodingRun, "status" | "stage" | "caseStatus">,
): boolean {
  return run.status === "failed";
}
