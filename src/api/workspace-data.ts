import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import type { MendSupabaseClient } from "../lib/supabase";

type Tables = Database["public"]["Tables"];
export type Workspace = Tables["workspaces"]["Row"];
export type ConversationRecord = Tables["conversations"]["Row"];
export type MessageRecord = Tables["messages"]["Row"];
export type IssueRecord = Tables["issues"]["Row"];
export type CodingRunRecord = Tables["coding_runs"]["Row"];
export type CodingRunEventRecord = Tables["coding_run_events"]["Row"];
export type KnowledgeArticleRecord = Tables["knowledge_articles"]["Row"];

export const workspaceRealtimeTables = [
  "conversations",
  "messages",
  "issues",
  "coding_runs",
  "channel_connections",
  "conversation_ai_state",
  "ai_drafts",
  "ai_draft_knowledge",
  "issue_comments",
  "coding_run_events",
  "knowledge_articles",
  "repositories",
  "evidence",
  "timeline_events",
  "notifications",
  "contacts",
  "issue_messages",
] as const;

async function unwrap<T>(
  result: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await result;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data as NonNullable<T>;
}

export function listWorkspaces(
  client: MendSupabaseClient,
): Promise<Workspace[]> {
  return unwrap(
    client.from("workspaces").select("*").order("name", { ascending: true }),
  );
}

export function listConversations(
  client: MendSupabaseClient,
  workspaceId: string,
  options: { limit?: number; status?: ConversationRecord["status"] } = {},
): Promise<ConversationRecord[]> {
  let query = client
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (options.status) query = query.eq("status", options.status);
  return unwrap(query.limit(options.limit ?? 100));
}

export function listMessages(
  client: MendSupabaseClient,
  workspaceId: string,
  conversationId: string,
): Promise<MessageRecord[]> {
  return unwrap(
    client
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  );
}

/**
 * Recovery query used after a realtime reconnect. The `gte` boundary is
 * intentional: the client deduplicates by database/provider id, so a small
 * overlap is safer than losing a message because of clock precision.
 */
export function listMessagesSince(
  client: MendSupabaseClient,
  workspaceId: string,
  since?: string,
): Promise<MessageRecord[]> {
  let query = client
    .from("messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (since) query = query.gte("created_at", since);
  return unwrap(query);
}

export function listIssues(
  client: MendSupabaseClient,
  workspaceId: string,
  options: { limit?: number; status?: IssueRecord["status"] } = {},
): Promise<IssueRecord[]> {
  let query = client
    .from("issues")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (options.status) query = query.eq("status", options.status);
  return unwrap(query.limit(options.limit ?? 100));
}

export function listCodingRuns(
  client: MendSupabaseClient,
  workspaceId: string,
  options: { issueId?: string; limit?: number } = {},
): Promise<CodingRunRecord[]> {
  let query = client
    .from("coding_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (options.issueId) query = query.eq("issue_id", options.issueId);
  return unwrap(query.limit(options.limit ?? 100));
}

export function listCodingRunEvents(
  client: MendSupabaseClient,
  workspaceId: string,
  codingRunId: string,
): Promise<CodingRunEventRecord[]> {
  return unwrap(
    client
      .from("coding_run_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("coding_run_id", codingRunId)
      .order("created_at", { ascending: true }),
  );
}

export function listKnowledgeArticles(
  client: MendSupabaseClient,
  workspaceId: string,
): Promise<KnowledgeArticleRecord[]> {
  return unwrap(
    client
      .from("knowledge_articles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
  );
}

export function createIssue(
  client: MendSupabaseClient,
  issue: Tables["issues"]["Insert"],
): Promise<IssueRecord> {
  return unwrap(client.from("issues").insert(issue).select("*").single());
}

export function createMessage(
  client: MendSupabaseClient,
  message: Tables["messages"]["Insert"],
): Promise<MessageRecord> {
  return unwrap(client.from("messages").insert(message).select("*").single());
}

export function updateConversation(
  client: MendSupabaseClient,
  workspaceId: string,
  conversationId: string,
  updates: Tables["conversations"]["Update"],
): Promise<ConversationRecord> {
  return unwrap(
    client
      .from("conversations")
      .update(updates)
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .select("*")
      .single(),
  );
}

export function subscribeToWorkspace(
  client: MendSupabaseClient,
  workspaceId: string,
  onChange: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void,
  options: { onStatus?: (status: string) => void; reconnect?: boolean } = {},
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;

  const refreshPayload = () =>
    ({
      eventType: "*",
      schema: "public",
      table: "*",
      commit_timestamp: new Date().toISOString(),
      new: {},
      old: {},
      errors: null,
    }) as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>;

  const scheduleReconnect = () => {
    if (stopped || options.reconnect === false || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };

  const connect = () => {
    if (stopped) return;
    if (channel) void client.removeChannel(channel);
    const next = client.channel(`workspace:${workspaceId}`);
    for (const table of workspaceRealtimeTables) {
      next.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `workspace_id=eq.${workspaceId}`,
        },
        onChange,
      );
    }
    channel = next;
    next.subscribe((status) => {
      options.onStatus?.(status);
      if (status === "SUBSCRIBED") {
        reconnectDelay = 1_000;
        // A reconnect can happen while the browser was offline. Refetching
        // here closes the gap between the last event and the current snapshot.
        onChange(refreshPayload());
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        if (channel === next) {
          channel = null;
          void client.removeChannel(next);
        }
        scheduleReconnect();
      }
    });
  };

  const reconnectNow = () => {
    if (stopped) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectDelay = 1_000;
    connect();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", reconnectNow);
    window.addEventListener("visibilitychange", reconnectNow);
  }

  connect();
  return () => {
    stopped = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", reconnectNow);
      window.removeEventListener("visibilitychange", reconnectNow);
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}
