import { redactJobError } from "../jobs.js";
export const WHATSAPP_INGEST_JOB_TYPE = "whatsmiau.message.received";
export const PROCESS_INBOUND_MESSAGE_JOB_TYPE = "mend.process_inbound_message";
export const SEND_AI_REPLY_JOB_TYPE = "mend.send_ai_reply";
export const CODING_RUN_CONTINUATION_JOB_TYPE = "mend.agent_run_continuation";
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
