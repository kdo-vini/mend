import { listMyWorkspaces } from "./auth";
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
export type CodingRunRecord = Tables["agent_runs"]["Row"];
export type CodingRunEventRecord = Tables["agent_run_events"]["Row"];
export type BugCaseRecord = Tables["bug_cases"]["Row"];
export type BugCaseEventRecord = Tables["bug_case_events"]["Row"];
export type KnowledgeArticleRecord = Tables["knowledge_articles"]["Row"];

export const workspaceRealtimeTables = [
  "conversations",
  "messages",
  "issues",
  "agent_runs",
  "conversation_ai_state",
  "ai_drafts",
  "issue_comments",
  "agent_run_events",
  "bug_cases",
  "bug_case_events",
  "knowledge_articles",
  "repositories",
  "evidence",
  "timeline_events",
  "notifications",
  "contacts",
  "issue_messages",
] as const;

export function hasActiveRuns(runs: readonly { status: string }[]): boolean {
  return runs.some(
    (run) => run.status === "queued" || run.status === "running",
  );
}

export function createRealtimeFallback(
  refresh: () => void,
  isHealthy: () => boolean,
  options: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    maxDurationMs?: number;
    isVisible?: () => boolean;
  } = {},
) {
  const initialDelayMs = options.initialDelayMs ?? 15_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const maxDurationMs = options.maxDurationMs ?? 5 * 60_000;
  const isVisible =
    options.isVisible ??
    (() =>
      typeof document === "undefined" ||
      document.visibilityState === "visible");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let nextDelayMs = initialDelayMs;

  const schedule = () => {
    if (timer !== null || isHealthy()) return;
    timer = setTimeout(() => {
      timer = null;
      if (isHealthy() || Date.now() - startedAt >= maxDurationMs) return;
      if (isVisible()) refresh();
      nextDelayMs = Math.min(nextDelayMs * 2, maxDelayMs);
      schedule();
    }, nextDelayMs);
  };

  return {
    start() {
      if (timer !== null) return;
      startedAt = Date.now();
      nextDelayMs = initialDelayMs;
      schedule();
    },
    stop() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Safety net for a realtime channel that reports SUBSCRIBED but no longer
 * delivers (sleeping tab, expired socket, dropped network). Realtime does not
 * replay missed rows, so this re-reads right after the operator returns to the
 * tab or the network comes back (at most once per `minGapMs`), and on an
 * interval only while realtime is not healthy.
 */
export function createLiveCatchUp(
  refresh: () => void,
  options: {
    intervalMs?: number;
    minGapMs?: number;
    isVisible?: () => boolean;
    /** While realtime is healthy the interval tick does nothing. */
    isRealtimeHealthy?: () => boolean;
  } = {},
) {
  const intervalMs = options.intervalMs ?? 30_000;
  const minGapMs = options.minGapMs ?? 10_000;
  const isRealtimeHealthy = options.isRealtimeHealthy ?? (() => false);
  const isVisible =
    options.isVisible ??
    (() =>
      typeof document === "undefined" ||
      document.visibilityState === "visible");
  const isOffline = () =>
    typeof navigator !== "undefined" && navigator.onLine === false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastRefreshAt = 0;

  const run = (force = false) => {
    if (!isVisible() || isOffline()) return;
    const now = Date.now();
    if (!force && now - lastRefreshAt < minGapMs) return;
    lastRefreshAt = now;
    refresh();
  };
  const onReturn = () => run();
  const onTick = () => {
    if (isRealtimeHealthy()) return;
    run(true);
  };

  return {
    start() {
      if (timer !== null) return;
      // Seed the gap so a focus event fired right after load is not a refetch.
      lastRefreshAt = Date.now();
      timer = setInterval(onTick, intervalMs);
      if (typeof window !== "undefined") {
        window.addEventListener("visibilitychange", onReturn);
        window.addEventListener("focus", onReturn);
        window.addEventListener("online", onReturn);
      }
    },
    /** Refresh now, e.g. after the realtime channel re-subscribes. */
    trigger() {
      run(true);
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("visibilitychange", onReturn);
        window.removeEventListener("focus", onReturn);
        window.removeEventListener("online", onReturn);
      }
    },
  };
}

function belongsToWorkspace(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  workspaceId: string,
) {
  const rows = [payload.new, payload.old].filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object",
  );
  const scopedRows = rows.filter((row) => "workspace_id" in row);

  // DELETE payloads may omit workspace_id when replica identity is not full.
  // RLS still limits delivered rows; unknown-scope events are safe to reconcile
  // because every follow-up query is explicitly scoped to this workspace.
  return (
    scopedRows.length === 0 ||
    scopedRows.every((row) => row.workspace_id === workspaceId)
  );
}

export async function listWorkspaces(
  client: MendSupabaseClient,
): Promise<Workspace[]> {
  return listMyWorkspaces(client);
}

export function subscribeToWorkspace(
  client: MendSupabaseClient,
  workspaceId: string,
  onChange: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void,
  options: {
    onStatus?: (status: string) => void;
    /** Called when the channel re-subscribes after an outage. */
    onResubscribed?: () => void;
    reconnect?: boolean;
  } = {},
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let connectAttempt = 0;
  let subscribedBefore = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;
  let realtimeHealthy = false;
  const isVisible = () =>
    typeof document === "undefined" || document.visibilityState === "visible";

  const scheduleReconnect = () => {
    if (
      stopped ||
      options.reconnect === false ||
      !isVisible() ||
      reconnectTimer
    )
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };

  const connect = () => {
    if (stopped) return;
    realtimeHealthy = false;
    if (channel) void client.removeChannel(channel);
    // A unique topic per attempt: removeChannel resolves asynchronously, and
    // reusing the topic would hand back the channel that is still leaving.
    connectAttempt += 1;
    const next = client.channel(`workspace:${workspaceId}:${connectAttempt}`);
    for (const table of workspaceRealtimeTables) {
      const options = {
        event: "*" as const,
        schema: "public" as const,
        table,
      };
      next.on("postgres_changes", options, (payload) => {
        if (!belongsToWorkspace(payload, workspaceId)) return;
        onChange(payload);
      });
    }
    channel = next;
    next.subscribe((status) => {
      realtimeHealthy = status === "SUBSCRIBED";
      options.onStatus?.(status);
      if (realtimeHealthy) {
        reconnectDelay = 1_000;
        // Rows written while the channel was down are never replayed.
        if (subscribedBefore) options.onResubscribed?.();
        subscribedBefore = true;
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
    if (stopped || !isVisible()) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectDelay = 1_000;
    connect();
  };
  const reconnectOnVisible = () => {
    if (document.visibilityState === "visible" && !realtimeHealthy)
      reconnectNow();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", reconnectNow);
    window.addEventListener("visibilitychange", reconnectOnVisible);
  }

  connect();
  return () => {
    stopped = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", reconnectNow);
      window.removeEventListener("visibilitychange", reconnectOnVisible);
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}
