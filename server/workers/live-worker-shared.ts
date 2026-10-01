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
