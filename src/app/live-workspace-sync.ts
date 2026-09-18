export type WorkspaceRefreshTarget =
  | { kind: "conversation"; id: string }
  | { kind: "notifications" }
  | { kind: "workspace" };

export function workspaceRefreshTarget(payload: {
  table?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}): WorkspaceRefreshTarget {
  const table = String(payload.table ?? "");
  const row = payload.new ?? payload.old ?? {};
  if (table === "notifications") return { kind: "notifications" };
  if (table === "messages") {
    const id = String(row.conversation_id ?? "");
    if (id) return { kind: "conversation", id };
  }
  if (table === "conversations") {
    const id = String(row.id ?? "");
    if (id) return { kind: "conversation", id };
  }
  return { kind: "workspace" };
}
