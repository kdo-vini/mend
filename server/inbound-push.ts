import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";
import type { InboxMessageRecord } from "./inbox-service.js";
import { WorkspacePushNotifier, type WorkspacePushPayload } from "./push.js";
import type { NormalizedWhatsmiauMessage } from "./whatsmiau.js";

export interface InboundPushNotifier {
  notify(workspaceId: string, payload: WorkspacePushPayload): Promise<unknown>;
}

export function createInboundPushNotifier(
  client: SupabaseClient<Database>,
): InboundPushNotifier {
  const push = new WorkspacePushNotifier();
  return {
    notify: (workspaceId, payload) => push.notify(client, workspaceId, payload),
  };
}

const PUSH_PREVIEW_LIMIT = 140;

/** Web push for a new inbound message; failures are logged, never thrown. */
export async function notifyInboundMessagePush(
  options: {
    pushNotifier?: InboundPushNotifier;
    logger?: { warn(bindings: Record<string, unknown>, message: string): void };
  },
  binding: { workspaceId: string },
  message: NormalizedWhatsmiauMessage,
  persisted: InboxMessageRecord,
): Promise<void> {
  const notifier = options.pushNotifier;
  if (message.direction !== "inbound" || persisted.inserted === false) return;

  if (!notifier) return;
  try {
    const raw = (persisted.transcript ?? message.text ?? message.caption ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const preview =
      raw.length > PUSH_PREVIEW_LIMIT
        ? `${raw.slice(0, PUSH_PREVIEW_LIMIT - 1)}…`
        : raw;
    const contact = (
      message.participantName ||
      message.contactName ||
      message.phoneNumber ||
      ""
    ).trim();
    await notifier.notify(binding.workspaceId, {
      title: "New message",
      body: preview || "Sent an attachment",
      kind: "inbox.message_received",
      url: `/inbox?conversation=${encodeURIComponent(persisted.conversationId)}`,
      tag: `inbox-message:${persisted.conversationId}`,
      copyParams: { contact, preview },
    });
  } catch (error) {
    options.logger?.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        conversationId: persisted.conversationId,
      },
      "inbound_push_notification_failed",
    );
  }
}
