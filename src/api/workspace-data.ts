import { listMyWorkspaces } from "./auth";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

export interface ConversationStamp {
  id: string;
  updatedAt: string;
}

/**
 * Safety net for a live channel that stays "SUBSCRIBED" yet stops delivering.
 * While the tab is visible it asks which conversations changed since the last
 * look (one indexed query on a small table) and re-reads only those, so a new
 * message shows up without reloading the page even when no hint arrives.
 *
 * The first look only records where things stand. Each look re-reads a short
 * overlap window because `updated_at` is stamped before commit: a slower
 * transaction can land with an earlier stamp than one already seen.
 */
export function createConversationWatch(
  fetchSince: (sinceIso: string | null) => Promise<ConversationStamp[]>,
  onChanged: (conversationIds: string[]) => void,
  options: {
    intervalMs?: number;
    overlapMs?: number;
    isVisible?: () => boolean;
  } = {},
) {
  const intervalMs = options.intervalMs ?? 15_000;
  const overlapMs = options.overlapMs ?? 60_000;
  const isVisible =
    options.isVisible ??
    (() =>
      typeof document === "undefined" ||
      document.visibilityState === "visible");
  const seen = new Map<string, string>();
  let watermark: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const check = async () => {
    if (inFlight || !isVisible()) return;
    inFlight = true;
    try {
      const since =
        watermark === null
          ? null
          : new Date(watermark - overlapMs).toISOString();
      const rows = await fetchSince(since);
      const firstLook = watermark === null;
      const changed: string[] = [];
      for (const row of rows) {
        const stamp = Date.parse(row.updatedAt);
        if (Number.isNaN(stamp)) continue;
        if (!firstLook && seen.get(row.id) !== row.updatedAt)
          changed.push(row.id);
        seen.set(row.id, row.updatedAt);
        watermark = Math.max(watermark ?? stamp, stamp);
      }
      // An empty workspace still needs a starting point.
      if (watermark === null) watermark = Date.now();
      if (changed.length) onChanged(changed);
    } catch {
      // Offline or a transient API error: the next tick retries.
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      if (timer !== null) return;
      void check();
      timer = setInterval(() => void check(), intervalMs);
    },
    /** Look now, e.g. when the operator returns to the tab. */
    check,
    stop() {
      if (timer !== null) clearInterval(timer);
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

/**
 * One live hint from the database. A trigger on each workspace table sends it
 * to the private topic `workspace:<id>` (see the
 * `fast_rls_and_workspace_broadcast` migration). It carries only ids and the
 * few fields the board applies in place, never message text: the browser
 * re-reads what changed through the RLS-protected API.
 */
export interface WorkspaceChange {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  record: Record<string, unknown>;
}

export function workspaceChangeFromBroadcast(
  payload: unknown,
  workspaceId: string,
): WorkspaceChange | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const record =
    value.record && typeof value.record === "object"
      ? (value.record as Record<string, unknown>)
      : {};
  if (typeof value.table !== "string") return null;
  if (record.workspace_id && record.workspace_id !== workspaceId) return null;
  const op =
    value.op === "INSERT" || value.op === "DELETE" ? value.op : "UPDATE";
  return { table: value.table, op, record };
}

const workspaceChangeListeners = new Set<(change: WorkspaceChange) => void>();

/**
 * Lets a screen (the board) react to the app's single workspace channel
 * instead of opening its own: two channels on one topic would share, and
 * closing one would close both.
 */
export function onWorkspaceChange(
  listener: (change: WorkspaceChange) => void,
): () => void {
  workspaceChangeListeners.add(listener);
  return () => {
    workspaceChangeListeners.delete(listener);
  };
}

export async function listWorkspaces(
  client: MendSupabaseClient,
): Promise<Workspace[]> {
  return listMyWorkspaces(client);
}

export function subscribeToWorkspace(
  client: MendSupabaseClient,
  workspaceId: string,
  onChange: (change: WorkspaceChange) => void,
  options: {
    onStatus?: (status: string) => void;
    /** Called when the channel re-subscribes after an outage. */
    onResubscribed?: () => void;
    reconnect?: boolean;
  } = {},
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let subscribedBefore = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;
  let realtimeHealthy = false;
  // Connections run one after another: the private topic is fixed, and
  // `client.channel` hands back a channel that is still leaving if the old one
  // has not finished unsubscribing.
  let connecting: Promise<void> = Promise.resolve();
  let leaving: Promise<unknown> = Promise.resolve();
  const leave = (old: RealtimeChannel) => {
    leaving = client.removeChannel(old).catch(() => undefined);
  };
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

  const open = async () => {
    if (stopped) return;
    realtimeHealthy = false;
    const previous = channel;
    channel = null;
    if (previous) leave(previous);
    await leaving;
    if (stopped) return;
    // Private channels authorize with the user's JWT on join.
    await client.realtime?.setAuth?.();
    if (stopped) return;
    const next = client.channel(`workspace:${workspaceId}`, {
      config: { private: true },
    });
    next.on("broadcast", { event: "change" }, (message) => {
      const change = workspaceChangeFromBroadcast(
        (message as { payload?: unknown }).payload,
        workspaceId,
      );
      if (!change) return;
      onChange(change);
      for (const listener of workspaceChangeListeners) listener(change);
    });
    channel = next;
    next.subscribe((status) => {
      if (channel !== next) return;
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
        channel = null;
        leave(next);
        scheduleReconnect();
      }
    });
  };

  const connect = () => {
    connecting = connecting.then(open).catch(() => {
      // setAuth failed (offline, expired session): try again with backoff.
      realtimeHealthy = false;
      options.onStatus?.("CHANNEL_ERROR");
      scheduleReconnect();
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
    const last = channel;
    channel = null;
    if (last) leave(last);
  };
}
