import type { AnySupabaseClient } from "./adapters/supabase/types.js";
import { supportReplyAllowed } from "./support-events.js";

/**
 * Read model and AI switch for one Support conversation, used by the MCP
 * tools. Pause and resume go through the same RPCs as the Inbox buttons, so
 * a bot obeying "não responda" leaves the same trail as a person doing it.
 */
export const supportPauseReasons = [
  "manual_pause",
  "customer_requested_human",
  "unsafe_intent",
  "low_confidence",
] as const;
export type SupportPauseReason = (typeof supportPauseReasons)[number];

export interface SupportConversationMessage {
  id: string;
  direction: string;
  /** contact (cliente), user (pessoa da equipe), ai or system. */
  senderType: string;
  messageType: string;
  text: string | null;
  createdAt: string;
  deleted: boolean;
}

export interface SupportConversationView {
  conversationId: string;
  contact: { name: string | null; phone: string | null };
  aiMode: string;
  status: string | null;
  attentionState: string | null;
  automationState: string | null;
  /** A person took over: the bot must stay quiet until the AI is resumed. */
  humanTookOver: boolean;
  humanTakeoverAt: string | null;
  humanTakeoverReason: string | null;
  pausedUntil: string | null;
  replyAllowed: boolean;
  /** Oldest first, so the transcript reads top to bottom. */
  messages: SupportConversationMessage[];
  hasOlderMessages: boolean;
}

export interface SupportConversationPort {
  view(input: {
    workspaceId: string;
    conversationId: string;
    limit: number;
  }): Promise<SupportConversationView | null>;
  pause(input: {
    workspaceId: string;
    conversationId: string;
    reason: SupportPauseReason;
  }): Promise<void>;
  resume(input: { workspaceId: string; conversationId: string }): Promise<void>;
}

type Row = Record<string, unknown>;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

function first(result: { data: unknown; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return (Array.isArray(result.data) ? result.data[0] : result.data) as
    | Row
    | undefined;
}

export class SupabaseSupportConversationPort
  implements SupportConversationPort
{
  constructor(private readonly client: AnySupabaseClient) {}

  async view(input: {
    workspaceId: string;
    conversationId: string;
    limit: number;
  }): Promise<SupportConversationView | null> {
    const conversation = first(
      await this.client
        .from("conversations")
        .select("id, ai_mode, status, attention_state, contact_id")
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.conversationId)
        .limit(1),
    );
    if (!conversation) return null;
    const [contactResult, stateResult, messageResult] = await Promise.all([
      typeof conversation.contact_id === "string"
        ? this.client
            .from("contacts")
            .select("display_name, phone_number")
            .eq("workspace_id", input.workspaceId)
            .eq("id", conversation.contact_id)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      this.client
        .from("conversation_ai_state")
        .select(
          "automation_state, human_takeover_at, human_takeover_reason, paused_until",
        )
        .eq("workspace_id", input.workspaceId)
        .eq("conversation_id", input.conversationId)
        .limit(1),
      this.client
        .from("messages")
        .select(
          "id, direction, sender_type, message_type, text, caption, is_deleted, created_at",
        )
        .eq("workspace_id", input.workspaceId)
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: false })
        .limit(input.limit + 1),
    ]);
    const contact = first(contactResult);
    const state = first(stateResult);
    if (messageResult.error) throw new Error(messageResult.error.message);
    const rows = (messageResult.data ?? []) as Row[];
    const aiMode = text(conversation.ai_mode) ?? "off";
    const automationState = text(state?.automation_state);
    return {
      conversationId: input.conversationId,
      contact: {
        name: text(contact?.display_name),
        phone: text(contact?.phone_number),
      },
      aiMode,
      status: text(conversation.status),
      attentionState: text(conversation.attention_state),
      automationState,
      humanTookOver: automationState === "human_paused",
      humanTakeoverAt: text(state?.human_takeover_at),
      humanTakeoverReason: text(state?.human_takeover_reason),
      pausedUntil: text(state?.paused_until),
      replyAllowed: supportReplyAllowed({ aiMode }),
      messages: rows
        .slice(0, input.limit)
        .reverse()
        .map((row) => ({
          id: String(row.id),
          direction: String(row.direction),
          senderType: String(row.sender_type),
          messageType: String(row.message_type ?? "text"),
          text: row.is_deleted ? null : (text(row.text) ?? text(row.caption)),
          createdAt: String(row.created_at),
          deleted: row.is_deleted === true,
        })),
      hasOlderMessages: rows.length > input.limit,
    };
  }

  async pause(input: {
    workspaceId: string;
    conversationId: string;
    reason: SupportPauseReason;
  }): Promise<void> {
    const result = await this.client.rpc("pause_conversation_ai", {
      p_workspace_id: input.workspaceId,
      p_conversation_id: input.conversationId,
      p_reason: input.reason,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async resume(input: {
    workspaceId: string;
    conversationId: string;
  }): Promise<void> {
    const result = await this.client.rpc("resume_conversation_ai", {
      p_workspace_id: input.workspaceId,
      p_conversation_id: input.conversationId,
    });
    if (result.error) throw new Error(result.error.message);
  }
}
