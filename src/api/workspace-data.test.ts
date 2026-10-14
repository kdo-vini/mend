import { describe, expect, it, vi } from "vitest";
import {
  createLiveCatchUp,
  createRealtimeFallback,
  hasActiveRuns,
  subscribeToWorkspace,
  workspaceRealtimeTables,
} from "./workspace-data";
import type { MendSupabaseClient } from "../lib/supabase";

describe("workspace realtime subscriptions", () => {
  it("marks only queued and running executions for status reconciliation", () => {
    expect(
      hasActiveRuns([
        { status: "completed" },
        { status: "failed" },
        { status: "canceled" },
      ]),
    ).toBe(false);
    expect(
      hasActiveRuns([{ status: "completed" }, { status: "running" }]),
    ).toBe(true);
  });

  it("subscribes to every live workspace surface without synthesizing a full refresh", () => {
    const registrations: Array<{
      options: Record<string, unknown>;
      handler: (payload: unknown) => void;
    }> = [];
    const statuses: string[] = [];
    let statusCallback: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn(
        (
          _event: string,
          options: Record<string, unknown>,
          handler: (payload: unknown) => void,
        ) => {
          registrations.push({ options, handler });
          return channel;
        },
      ),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        statusCallback = callback;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as MendSupabaseClient;
    const changes: unknown[] = [];
    const unsubscribe = subscribeToWorkspace(
      client,
      "workspace-1",
      (payload) => changes.push(payload),
      {
        reconnect: false,
        onStatus: (status) => statuses.push(status),
      },
    );

    expect(channel.on).toHaveBeenCalledTimes(workspaceRealtimeTables.length);
    expect(workspaceRealtimeTables).toContain("messages");
    expect(workspaceRealtimeTables).toContain("agent_runs");
    expect(workspaceRealtimeTables).toContain("knowledge_articles");
    expect(workspaceRealtimeTables).toContain("contacts");
    expect(workspaceRealtimeTables).toContain("issue_messages");
    expect(workspaceRealtimeTables).not.toContain("ai_draft_knowledge");
    expect(registrations.every((item) => !("filter" in item.options))).toBe(
      true,
    );

    statusCallback?.("SUBSCRIBED");
    expect(changes).toHaveLength(0);
    expect(statuses).toEqual(["SUBSCRIBED"]);
    registrations
      .find((item) => item.options.table === "messages")
      ?.handler({ eventType: "INSERT", table: "messages" });
    expect(changes).toHaveLength(1);

    const messagesHandler = registrations.find(
      (item) => item.options.table === "messages",
    )?.handler;
    messagesHandler?.({ new: { workspace_id: "other" }, old: {} });
    expect(changes).toHaveLength(1);
    messagesHandler?.({ new: { workspace_id: "workspace-1" }, old: {} });
    expect(changes).toHaveLength(2);

    statusCallback?.("CHANNEL_ERROR");
    expect(statuses).toEqual(["SUBSCRIBED", "CHANNEL_ERROR"]);

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("reconnects only when a hidden tab becomes visible again", () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, listener: () => void) =>
        listeners.set(event, listener),
      ),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        statusCallback = callback;
        return channel;
      }),
    };
    let statusCallback: ((status: string) => void) | undefined;
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as MendSupabaseClient;

    const unsubscribe = subscribeToWorkspace(
      client,
      "workspace-1",
      () => undefined,
    );

    statusCallback?.("SUBSCRIBED");
    (globalThis.document as { visibilityState: string }).visibilityState =
      "visible";
    listeners.get("visibilitychange")?.();
    expect(client.channel).toHaveBeenCalledTimes(1);

    (globalThis.document as { visibilityState: string }).visibilityState =
      "hidden";
    statusCallback?.("CHANNEL_ERROR");
    vi.advanceTimersByTime(30_000);
    expect(client.channel).toHaveBeenCalledTimes(1);

    listeners.get("visibilitychange")?.();
    expect(client.channel).toHaveBeenCalledTimes(1);

    (globalThis.document as { visibilityState: string }).visibilityState =
      "visible";
    listeners.get("visibilitychange")?.();
    expect(client.channel).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("backs off degraded reconciliation and stops after five minutes", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let healthy = false;
    const fallback = createRealtimeFallback(refresh, () => healthy);

    fallback.start();
    vi.advanceTimersByTime(14_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(29_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);

    healthy = true;
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);

    fallback.stop();
    healthy = false;
    vi.advanceTimersByTime(300_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("re-reads after the channel re-subscribes, never on the first join", () => {
    let statusCallback: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        statusCallback = callback;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as MendSupabaseClient;
    const onResubscribed = vi.fn();

    const unsubscribe = subscribeToWorkspace(
      client,
      "workspace-1",
      () => undefined,
      { reconnect: false, onResubscribed },
    );

    statusCallback?.("SUBSCRIBED");
    expect(onResubscribed).not.toHaveBeenCalled();
    statusCallback?.("CHANNEL_ERROR");
    statusCallback?.("SUBSCRIBED");
    expect(onResubscribed).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("uses a fresh topic per connection so a leaving channel is never reused", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { visibilityState: "visible" });
    let statusCallback: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        statusCallback = callback;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as MendSupabaseClient;

    const unsubscribe = subscribeToWorkspace(
      client,
      "workspace-1",
      () => undefined,
    );
    statusCallback?.("CHANNEL_ERROR");
    vi.advanceTimersByTime(1_000);

    const topics = vi.mocked(client.channel).mock.calls.map(([topic]) => topic);
    expect(topics).toHaveLength(2);
    expect(new Set(topics).size).toBe(2);
    expect(
      topics.every((topic) => topic.startsWith("workspace:workspace-1")),
    ).toBe(true);

    unsubscribe();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("catches up on an interval and when the operator returns to the tab", () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, listener: () => void) =>
        listeners.set(event, listener),
      ),
      removeEventListener: vi.fn((event: string) => listeners.delete(event)),
    });
    let visible = true;
    const refresh = vi.fn();
    const catchUp = createLiveCatchUp(refresh, {
      intervalMs: 30_000,
      minGapMs: 5_000,
      isVisible: () => visible,
    });

    catchUp.start();
    // A focus right after load is not a refetch.
    listeners.get("focus")?.();
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Hidden tabs do not poll.
    visible = false;
    vi.advanceTimersByTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Returning to the tab re-reads once, even when several events fire.
    visible = true;
    listeners.get("visibilitychange")?.();
    listeners.get("focus")?.();
    expect(refresh).toHaveBeenCalledTimes(2);

    // A realtime re-subscribe always re-reads.
    catchUp.trigger();
    expect(refresh).toHaveBeenCalledTimes(3);

    catchUp.stop();
    expect(listeners.size).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
