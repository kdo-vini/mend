import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";

/**
 * Worker side of deferred provider message events (status / delete / edit).
 * The Edge Function enqueues one when the target message row does not exist
 * yet; the job retries (jobs backoff) until ingestion has stored the row.
 * Keep `supabase/functions/whats-mend-webhook/message-events.ts` in sync.
 */
export const MESSAGE_EVENT_JOB_TYPE = "whatsmiau.message.event";

export type ProviderMessageEvent =
  | { kind: "status"; providerMessageId: string; status: string }
  | { kind: "delete"; providerMessageId: string }
  | { kind: "edit"; providerMessageId: string; text: string };

export interface MessageEventJobPayload {
  channelConnectionId: string;
  event: ProviderMessageEvent;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Statuses `next` must not overwrite: at/above it in the order, or deleted. */
export function blockedStatusesFor(next: string): string[] {
  const rank = STATUS_RANK[next];
  const forward =
    rank === undefined
      ? ["delivered", "read"]
      : Object.keys(STATUS_RANK).filter((s) => (STATUS_RANK[s] ?? 0) >= rank);
  return [...new Set([...forward, "deleted"])];
}

export function canAdvanceStatus(
  current: string | null | undefined,
  next: string,
): boolean {
  return !current || !blockedStatusesFor(next).includes(current);
}

export function isMessageEventPayload(
  value: unknown,
): value is MessageEventJobPayload {
  const payload = value as Partial<MessageEventJobPayload> | null;
  const event = payload?.event as Partial<ProviderMessageEvent> | undefined;
  return (
    typeof payload?.channelConnectionId === "string" &&
    typeof event?.providerMessageId === "string" &&
    (event.kind === "delete" ||
      (event.kind === "status" && typeof event.status === "string") ||
      (event.kind === "edit" && typeof event.text === "string"))
  );
}

/**
 * Applies the event. Throws `message_event_target_missing` while the message
 * row is absent so the job store retries with backoff.
 */
export async function applyDeferredMessageEvent(
  client: SupabaseClient<Database>,
  workspaceId: string,
  payload: MessageEventJobPayload,
): Promise<void> {
  const { event } = payload;
  const { data: existing, error: lookupError } = await client
    .from("messages")
    .select("id, message_type, provider_status")
    .eq("workspace_id", workspaceId)
    .eq("channel_connection_id", payload.channelConnectionId)
    .eq("provider_message_id", event.providerMessageId)
    .maybeSingle();
  if (lookupError) throw new Error("message_event_lookup_failed");
  if (!existing) throw new Error("message_event_target_missing");

  const now = new Date().toISOString();
  if (event.kind === "status") {
    if (!canAdvanceStatus(existing.provider_status, event.status)) return;
    const { error } = await client
      .from("messages")
      .update({ provider_status: event.status, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id)
      .or(
        `provider_status.is.null,provider_status.not.in.(${blockedStatusesFor(event.status).join(",")})`,
      );
    if (error) throw new Error("message_event_update_failed");
    return;
  }
  if (event.kind === "delete") {
    const { error } = await client
      .from("messages")
      .update({ is_deleted: true, provider_status: "deleted", updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id);
    if (error) throw new Error("message_event_update_failed");
    return;
  }
  const { error } = await client
    .from("messages")
    .update({
      text: event.text,
      ...(existing.message_type !== "text" ? { caption: event.text } : {}),
      edited_at: now,
      updated_at: now,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", existing.id)
    .eq("is_deleted", false);
  if (error) throw new Error("message_event_update_failed");
}
