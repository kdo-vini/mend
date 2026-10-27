/**
 * Provider status / delete / edit events for messages we already stored. Kept
 * free of Deno imports so server tests can exercise it.
 * Keep `server/message-events.ts` (the deferred-job worker side) in sync.
 */
import { extractProviderMessageEdit } from "./message-edit.ts";

type JsonRecord = Record<string, unknown>;

export type ProviderMessageEvent =
  | { kind: "status"; providerMessageId: string; status: string }
  | { kind: "delete"; providerMessageId: string }
  | { kind: "edit"; providerMessageId: string; text: string };

export interface MessageEventBinding {
  id: string;
  workspace_id: string;
}

/**
 * Deferred re-apply job: the event arrived before the message row existed
 * (its ingest job is still queued), so the worker retries until it does.
 */
export const MESSAGE_EVENT_JOB_TYPE = "whatsmiau.message.event";
export const MESSAGE_EVENT_MAX_ATTEMPTS = 8;

// Minimal structural client so this file does not import supabase-js.
// deno-lint-ignore no-explicit-any
type Client = { from(table: string): any };

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const stringValue = (...values: unknown[]): string | undefined =>
  values
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    ?.trim();

export function normalizeProviderStatus(value: unknown): string | undefined {
  const status =
    typeof value === "string"
      ? value.trim().toLowerCase().replaceAll("-", "_")
      : "";
  if (["error", "failed", "failure"].includes(status)) return "failed";
  if (["server_ack", "sent", "ack"].includes(status)) return "sent";
  if (["delivery_ack", "delivered"].includes(status)) return "delivered";
  if (["read", "played"].includes(status)) return "read";
  return undefined;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * Current statuses that must NOT be overwritten by `next`: anything at or
 * above it in pending < sent < delivered < read, plus `deleted`. `failed`
 * never replaces delivered/read (a late error cannot undo a delivery).
 */
export function blockedStatusesFor(next: string): string[] {
  const rank = STATUS_RANK[next];
  const forward =
    rank === undefined
      ? ["delivered", "read"]
      : Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s]! >= rank);
  return [...new Set([...forward, "deleted"])];
}

/** True when `current` may be replaced by `next` (null/unknown always may). */
export function canAdvanceStatus(
  current: string | null | undefined,
  next: string,
): boolean {
  return !current || !blockedStatusesFor(next).includes(current);
}

/** Every record of `payload.data` (object, array or `{ messages: [] }`). */
function dataRecords(payload: JsonRecord): JsonRecord[] {
  if (Array.isArray(payload.data))
    return payload.data
      .map(asRecord)
      .filter((value) => Object.keys(value).length > 0);
  const data = asRecord(payload.data);
  return Object.keys(data).length > 0 ? [data] : [];
}

export function extractProviderMessageEvents(
  event: "messages.update" | "messages.delete" | "messages.edited",
  payload: JsonRecord,
): ProviderMessageEvent[] {
  const events: ProviderMessageEvent[] = [];
  for (const data of dataRecords(payload)) {
    if (event === "messages.update") {
      const providerMessageId = stringValue(
        data.messageId,
        data.keyId,
        asRecord(data.key).id,
        data.id,
      );
      const status = normalizeProviderStatus(
        data.status ?? data.statusCode ?? payload.status,
      );
      if (providerMessageId && status)
        events.push({ kind: "status", providerMessageId, status });
    } else if (event === "messages.delete") {
      const providerMessageId = stringValue(data.id, asRecord(data.key).id);
      if (providerMessageId) events.push({ kind: "delete", providerMessageId });
    } else {
      const edit = extractProviderMessageEdit({ ...payload, data });
      if (edit) events.push({ kind: "edit", ...edit });
    }
  }
  return events;
}

/**
 * Applies one event. `found` is false only when the message row does not
 * exist yet; a stale (non-advancing) status is found but not updated.
 */
export async function applyProviderMessageEvent(
  client: Client,
  binding: MessageEventBinding,
  event: ProviderMessageEvent,
): Promise<{ found: boolean; updated: boolean }> {
  const scoped = () =>
    client
      .from("messages")
      .select("id, message_type, provider_status")
      .eq("workspace_id", binding.workspace_id)
      .eq("channel_connection_id", binding.id)
      .eq("provider_message_id", event.providerMessageId);
  const { data: existing, error: lookupError } = await scoped().maybeSingle();
  if (lookupError)
    throw new Error(
      `message_event_lookup_failed:${lookupError.code ?? "database"}`,
    );
  if (!existing) return { found: false, updated: false };

  const now = new Date().toISOString();
  let patch: JsonRecord;
  if (event.kind === "status") {
    if (!canAdvanceStatus(existing.provider_status, event.status))
      return { found: true, updated: false };
    patch = { provider_status: event.status, updated_at: now };
  } else if (event.kind === "delete") {
    patch = { is_deleted: true, provider_status: "deleted", updated_at: now };
  } else {
    patch = {
      text: event.text,
      ...(existing.message_type !== "text" ? { caption: event.text } : {}),
      edited_at: now,
      updated_at: now,
    };
  }
  let query = client
    .from("messages")
    .update(patch)
    .eq("workspace_id", binding.workspace_id)
    .eq("id", existing.id);
  // Re-check the status in the predicate so a concurrent later status cannot
  // be overwritten between the lookup and the write.
  if (event.kind === "status")
    query = query.or(
      `provider_status.is.null,provider_status.not.in.(${blockedStatusesFor(event.status).join(",")})`,
    );
  if (event.kind === "edit") query = query.eq("is_deleted", false);
  const { data: rows, error } = await query.select("id");
  if (error)
    throw new Error(`message_event_update_failed:${error.code ?? "database"}`);
  return { found: true, updated: Boolean(rows?.length) };
}

/** Durable job row for an event whose message is not stored yet. */
export async function buildMessageEventJob(
  binding: MessageEventBinding,
  event: ProviderMessageEvent,
  digest: (value: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const detail =
    event.kind === "status"
      ? event.status
      : event.kind === "edit"
        ? (await digest(event.text)).slice(0, 16)
        : "";
  return {
    workspace_id: binding.workspace_id,
    type: MESSAGE_EVENT_JOB_TYPE,
    payload: { channelConnectionId: binding.id, event },
    status: "queued",
    attempts: 0,
    max_attempts: MESSAGE_EVENT_MAX_ATTEMPTS,
    available_at: new Date().toISOString(),
    dedupe_key: `whatsmiau:event:${binding.id}:${event.kind}:${event.providerMessageId}:${detail}`,
  };
}
