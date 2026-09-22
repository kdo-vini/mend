import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient;

export type ConversationPendingActionStatus =
  | "pending"
  | "executed"
  | "cancelled"
  | "expired"
  | "failed";

export type ConversationPendingAction = {
  id: string;
  workspaceId: string;
  conversationId: string;
  ownerRef: string | null;
  toolName: string;
  argumentsJson: Record<string, unknown>;
  status: ConversationPendingActionStatus;
  summary: string;
  externalActionId: string | null;
  resultJson: Record<string, unknown> | null;
  idempotencyKey: string;
  expiresAt: string;
};

function mapRow(row: Record<string, unknown>): ConversationPendingAction {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    conversationId: String(row.conversation_id),
    ownerRef: typeof row.owner_ref === "string" ? row.owner_ref : null,
    toolName: String(row.tool_name),
    argumentsJson:
      row.arguments_json &&
      typeof row.arguments_json === "object" &&
      !Array.isArray(row.arguments_json)
        ? (row.arguments_json as Record<string, unknown>)
        : {},
    status: row.status as ConversationPendingActionStatus,
    summary: String(row.summary ?? ""),
    externalActionId:
      typeof row.external_action_id === "string" ? row.external_action_id : null,
    resultJson:
      row.result_json &&
      typeof row.result_json === "object" &&
      !Array.isArray(row.result_json)
        ? (row.result_json as Record<string, unknown>)
        : null,
    idempotencyKey: String(row.idempotency_key),
    expiresAt: String(row.expires_at),
  };
}

export class ConversationPendingActionStore {
  constructor(private readonly client: Client) {}

  async getPending(
    workspaceId: string,
    conversationId: string,
    now = new Date(),
  ): Promise<ConversationPendingAction | null> {
    const result = await this.client
      .from("conversation_pending_actions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .eq("status", "pending")
      .maybeSingle();
    if (result.error)
      throw new Error(
        `supabase:conversation_pending_actions:${result.error.message}`,
      );
    if (!result.data) return null;
    const action = mapRow(result.data as Record<string, unknown>);
    if (new Date(action.expiresAt).getTime() <= now.getTime()) {
      await this.markStatus(action.id, workspaceId, "expired");
      return null;
    }
    return action;
  }

  async create(input: {
    workspaceId: string;
    conversationId: string;
    ownerRef?: string | null;
    toolName: string;
    argumentsJson?: Record<string, unknown>;
    summary: string;
    externalActionId?: string | null;
    idempotencyKey: string;
    expiresAt: Date;
  }): Promise<ConversationPendingAction> {
    const now = new Date().toISOString();
    await this.client
      .from("conversation_pending_actions")
      .update({ status: "cancelled", updated_at: now })
      .eq("workspace_id", input.workspaceId)
      .eq("conversation_id", input.conversationId)
      .eq("status", "pending");

    const inserted = await this.client
      .from("conversation_pending_actions")
      .insert({
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        owner_ref: input.ownerRef ?? null,
        tool_name: input.toolName,
        arguments_json: input.argumentsJson ?? {},
        status: "pending",
        summary: input.summary.slice(0, 2000),
        external_action_id: input.externalActionId ?? null,
        idempotency_key: input.idempotencyKey,
        expires_at: input.expiresAt.toISOString(),
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    if (inserted.error) {
      if (/duplicate|unique/i.test(inserted.error.message)) {
        const existing = await this.client
          .from("conversation_pending_actions")
          .select("*")
          .eq("workspace_id", input.workspaceId)
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (existing.error)
          throw new Error(
            `supabase:conversation_pending_actions:${existing.error.message}`,
          );
        if (existing.data)
          return mapRow(existing.data as Record<string, unknown>);
      }
      throw new Error(
        `supabase:conversation_pending_actions:${inserted.error.message}`,
      );
    }
    if (!inserted.data)
      throw new Error("supabase:conversation_pending_actions:empty_insert");
    return mapRow(inserted.data as Record<string, unknown>);
  }

  async markStatus(
    id: string,
    workspaceId: string,
    status: ConversationPendingActionStatus,
    resultJson?: Record<string, unknown>,
  ): Promise<void> {
    const updated = await this.client
      .from("conversation_pending_actions")
      .update({
        status,
        ...(resultJson ? { result_json: resultJson } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (updated.error)
      throw new Error(
        `supabase:conversation_pending_actions:${updated.error.message}`,
      );
  }
}
