import type { CodexContextInput, StartCodexRunInput } from "./codex-service.js";
import type { SafeTool } from "./codex.js";

export const AGENT_RUN_REQUESTED_JOB_TYPE = "mend.agent_run_requested";

export function agentMaxRuntimeMs(): number {
  const seconds = Number.parseInt(
    process.env.MEND_AGENT_MAX_RUNTIME_SECONDS ?? "1200",
    10,
  );
  return Math.min(
    60 * 60_000,
    Math.max(60_000, Number.isFinite(seconds) ? seconds * 1_000 : 1_200_000),
  );
}

export interface AgentRunRequestedJobPayload {
  stage: "agent_run_requested";
  runId: string;
  workspaceId: string;
  issueId: string;
  repositoryId: string;
  issueIdentifier: string;
  issueTitle: string;
  mode: StartCodexRunInput["mode"];
  context: CodexContextInput;
  tools: readonly SafeTool[];
  createdByUserId?: string;
  maxRuntimeMs?: number;
  commandTimeoutMs?: number;
}
