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
  // Per-thread AI state and drafts are part of the conversation snapshot.
  if (table === "conversation_ai_state" || table === "ai_drafts") {
    const id = String(row.conversation_id ?? "");
    if (id) return { kind: "conversation", id };
  }
  return { kind: "workspace" };
}

export type LiveRefreshBatch = {
  workspace: boolean;
  notifications: boolean;
  conversationIds: string[];
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

  return {
    add(target: WorkspaceRefreshTarget) {
      if (target.kind === "workspace") workspace = true;
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
        };
        workspace = false;
        notifications = false;
        conversationIds.clear();
        flush(batch);
      }, delayMs);
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      workspace = false;
      notifications = false;
      conversationIds.clear();
    },
  };
}
