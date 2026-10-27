export type WorkspaceRefreshTarget =
  | { kind: "conversation"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "notifications" }
  | { kind: "workspace" }
  | { kind: "ignore" };

const conversationTables = new Set([
  "messages",
  "conversations",
  "conversation_ai_state",
  "ai_drafts",
]);

/** Tables whose rows feed the full workspace hydrate (issues, runs, KB). */
const workspaceTables = new Set([
  "issues",
  "agent_runs",
  "issue_comments",
  "agent_run_events",
  "bug_cases",
  "bug_case_events",
  "knowledge_articles",
  "repositories",
  "evidence",
  "timeline_events",
  "issue_messages",
]);

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
  // Per-thread AI state and drafts are part of the conversation snapshot.
  if (table === "conversation_ai_state" || table === "ai_drafts") {
    const id = String(row.conversation_id ?? "");
    if (id) return { kind: "conversation", id };
  }
  // The webhook upserts the contact on nearly every inbound event: refresh
  // only the threads that belong to it, never the whole workspace.
  if (table === "contacts") {
    const id = String(row.id ?? "");
    return id ? { kind: "contact", id } : { kind: "ignore" };
  }
  // Conversation-scoped rows without an id (DELETE without replica identity)
  // cannot be targeted, so they reconcile through one workspace refresh.
  if (workspaceTables.has(table) || conversationTables.has(table))
    return { kind: "workspace" };
  // channel_connections.last_event_at changes on every webhook event and the
  // client reads channels over HTTP; unknown tables never justify a hydrate.
  return { kind: "ignore" };
}

export type LiveRefreshBatch = {
  workspace: boolean;
  notifications: boolean;
  conversationIds: string[];
  contactIds: string[];
};

/**
 * One operator action (send a photo, reply, assign) writes several rows —
 * message insert, media/delivery updates, conversation, AI state, drafts —
 * and each arrives as its own realtime event. Reloading per event stacked a
 * dozen serial snapshots and re-rendered the thread on every one. Events in
 * the same window collapse into a single refresh per target.
 */
export function createLiveRefreshBatcher(
  flush: (batch: LiveRefreshBatch) => void,
  delayMs = 300,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let workspace = false;
  let notifications = false;
  const conversationIds = new Set<string>();
  const contactIds = new Set<string>();

  return {
    add(target: WorkspaceRefreshTarget) {
      if (target.kind === "ignore") return;
      if (target.kind === "contact") contactIds.add(target.id);
      else if (target.kind === "workspace") workspace = true;
      else if (target.kind === "notifications") notifications = true;
      else conversationIds.add(target.id);
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const batch: LiveRefreshBatch = {
          workspace,
          // A workspace refresh already reloads notifications.
          notifications: notifications && !workspace,
          conversationIds: [...conversationIds],
          contactIds: [...contactIds],
        };
        workspace = false;
        notifications = false;
        conversationIds.clear();
        contactIds.clear();
        flush(batch);
      }, delayMs);
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      workspace = false;
      notifications = false;
      conversationIds.clear();
      contactIds.clear();
    },
  };
}
