import type { CodingRun } from "../../types";

export function selectRun(
  runs: CodingRun[],
  requestedId: string | null,
): CodingRun | null {
  return runs.find((run) => run.id === requestedId) ?? runs[0] ?? null;
}
