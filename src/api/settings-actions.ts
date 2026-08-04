import type { Database } from "../lib/database.types";
import { supabase, type MendSupabaseClient } from "../lib/supabase";
import type { AiMode } from "../types";

type Tables = Database["public"]["Tables"];
export type WorkspaceMemberRecord = Tables["workspace_members"]["Row"];
export type AuditLogRecord = Tables["audit_log"]["Row"];

export interface AiConversationPolicy {
  totalConversations: number;
  counts: Record<AiMode, number>;
  dominantMode: AiMode | "mixed";
}

function requireClient(client: MendSupabaseClient | null): MendSupabaseClient {
  if (!client)
    throw new Error("Supabase is not configured for live workspace settings.");
  return client;
}

async function unwrap<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no settings data.");
  return data;
}

export function listLiveWorkspaceMembers(
  workspaceId: string,
  client: MendSupabaseClient | null = supabase,
) {
  return unwrap(
    requireClient(client)
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
  );
}

export function listLiveAuditLog(
  workspaceId: string,
  client: MendSupabaseClient | null = supabase,
) {
  return unwrap(
    requireClient(client)
      .from("audit_log")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
  );
}

export async function loadLiveAiConversationPolicy(
  workspaceId: string,
  client: MendSupabaseClient | null = supabase,
): Promise<AiConversationPolicy> {
  const rows = await unwrap(
    requireClient(client)
      .from("conversations")
      .select("id, ai_mode")
      .eq("workspace_id", workspaceId),
  );
  const counts: Record<AiMode, number> = { off: 0, draft: 0, safe_auto: 0 };
  for (const row of rows) {
    if (
      row.ai_mode === "off" ||
      row.ai_mode === "draft" ||
      row.ai_mode === "safe_auto"
    )
      counts[row.ai_mode] += 1;
  }
  const modes = (Object.keys(counts) as AiMode[]).filter(
    (mode) => counts[mode] > 0,
  );
  const dominantMode =
    modes.length === 1 ? modes[0] : modes.length === 0 ? "draft" : "mixed";
  return { totalConversations: rows.length, counts, dominantMode };
}

/**
 * The current schema stores AI behavior on each conversation, not on the
 * workspace. This updates every live conversation and returns the server's
 * affected-row count so the UI never reports a setting that was not saved.
 */
export async function saveLiveConversationAiPolicy(
  workspaceId: string,
  mode: AiMode,
  client: MendSupabaseClient | null = supabase,
) {
  const rows = await unwrap(
    requireClient(client)
      .from("conversations")
      .update({ ai_mode: mode, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .select("id"),
  );
  return { updatedCount: rows.length, mode };
}
