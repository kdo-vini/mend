import type {
  LiveChannelBinding,
  LiveWorkerChannelResolver,
} from "../live-worker.js";
import { redactJobError } from "../jobs.js";
export const WHATSAPP_INGEST_JOB_TYPE = "whatsmiau.message.received";
export const PROCESS_INBOUND_MESSAGE_JOB_TYPE = "mend.process_inbound_message";
export const SEND_AI_REPLY_JOB_TYPE = "mend.send_ai_reply";
export const CODING_RUN_CONTINUATION_JOB_TYPE = "mend.agent_run_continuation";
export const KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE =
  "mend.knowledge.repository_sync";
export const SUPPORT_REPOSITORY_RESEARCH_JOB_TYPE =
  "mend.support.repository_research";
export const SUPPORT_AI_ENABLED_ENV = "MEND_SUPPORT_AI_ENABLED";

/** Jobs that run Mend's own Support AI or can message customers on its behalf. */
export const SUPPORT_AI_JOB_TYPES: ReadonlySet<string> = new Set([
  PROCESS_INBOUND_MESSAGE_JOB_TYPE,
  SEND_AI_REPLY_JOB_TYPE,
  CODING_RUN_CONTINUATION_JOB_TYPE,
  SUPPORT_REPOSITORY_RESEARCH_JOB_TYPE,
]);

/** Kill-switch: AI stages queued before it was turned off finish as no-ops. */
export function skipsSupportAiJob(
  supportAiEnabled: boolean | undefined,
  jobType: string,
): boolean {
  return supportAiEnabled !== true && SUPPORT_AI_JOB_TYPES.has(jobType);
}

/**
 * Support AI kill-switch. Fail-closed: only an explicit "true"/"1" re-enables
 * Mend triage, drafts, knowledge retrieval and AI WhatsApp sends.
 */
export function isSupportAiEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[SUPPORT_AI_ENABLED_ENV]?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function safeOperationalError(error: unknown): string {
  return redactJobError(error);
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function cleanInstanceName(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 240 ? normalized : "";
}

export async function validateQueuedBinding(
  resolver: LiveWorkerChannelResolver,
  binding: LiveChannelBinding,
  jobWorkspaceId: string | null | undefined,
): Promise<void> {
  const current = await resolver.resolve(binding.instanceName);
  if (
    !current ||
    current.workspaceId !== binding.workspaceId ||
    current.channelConnectionId !== binding.channelConnectionId ||
    current.instanceName !== binding.instanceName ||
    (jobWorkspaceId && jobWorkspaceId !== current.workspaceId)
  ) {
    throw new Error("job_workspace_channel_mismatch");
  }
}

/** Default debounce before triage/draft. Override with MEND_INBOUND_DEBOUNCE_MS. */
export const DEFAULT_INBOUND_DEBOUNCE_MS = 1_500;

/** Parse inbound debounce from env; invalid/missing → default. Cap 30s. */
export function resolveInboundDebounceMs(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): number {
  const raw = env.MEND_INBOUND_DEBOUNCE_MS;
  if (raw === undefined || raw.trim() === "")
    return DEFAULT_INBOUND_DEBOUNCE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0)
    return DEFAULT_INBOUND_DEBOUNCE_MS;
  return Math.min(30_000, Math.floor(parsed));
}
