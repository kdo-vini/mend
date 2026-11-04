import { describe, expect, it, vi } from "vitest";
import {
  createConversationWatch,
  createLiveCatchUp,
  createRealtimeFallback,
  hasActiveRuns,
  onWorkspaceChange,
  subscribeToWorkspace,
  type WorkspaceChange,
} from "./workspace-data";
import type { MendSupabaseClient } from "../lib/supabase";

function fakeRealtime() {
  let statusCallback: ((status: string) => void) | undefined;
  let broadcastHandler: ((message: unknown) => void) | undefined;
  const channel = {
    on: vi.fn(
      (
        _type: string,
        _filter: Record<string, unknown>,
        handler: (message: unknown) => void,
      ) => {
        broadcastHandler = handler;
        return channel;
      },
    ),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      statusCallback = callback;
      return channel;
    }),
  };
  const setAuth = vi.fn(async () => undefined);
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
    realtime: { setAuth },
  } as unknown as MendSupabaseClient;
  return {
    channel,
    client,
    setAuth,
    status: (value: string) => statusCallback?.(value),
    broadcast: (payload: unknown) => broadcastHandler?.({ payload }),
  };
}

/** Lets the serialized connect chain (removeChannel, setAuth, join) run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

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

  it("joins the private workspace topic and forwards id-only changes", async () => {
    vi.useFakeTimers();
    const realtime = fakeRealtime();
    const statuses: string[] = [];
    const changes: WorkspaceChange[] = [];
    const boardChanges: WorkspaceChange[] = [];
    const stopBoard = onWorkspaceChange((change) => boardChanges.push(change));
    const unsubscribe = subscribeToWorkspace(
      realtime.client,
      "workspace-1",
      (change) => changes.push(change),
      { reconnect: false, onStatus: (status) => statuses.push(status) },
    );
    await settle();

    expect(realtime.setAuth).toHaveBeenCalled();
    expect(realtime.client.channel).toHaveBeenCalledWith(
      "workspace:workspace-1",
      { config: { private: true } },
    );
    expect(realtime.channel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "change" },
      expect.any(Function),
    );

    realtime.status("SUBSCRIBED");
    expect(statuses).toEqual(["SUBSCRIBED"]);
    expect(changes).toHaveLength(0);

    realtime.broadcast({
      table: "messages",
      op: "INSERT",
      record: { id: "m1", conversation_id: "c1", workspace_id: "workspace-1" },
    });
    realtime.broadcast({
      table: "messages",
      op: "INSERT",
      record: { id: "m2", workspace_id: "other" },
    });
    realtime.broadcast({ op: "INSERT" });
    expect(changes).toEqual([
      {
        table: "messages",
        op: "INSERT",
        record: {
          id: "m1",
          conversation_id: "c1",
          workspace_id: "workspace-1",
        },
      },
    ]);
    expect(boardChanges).toEqual(changes);

    realtime.status("CHANNEL_ERROR");
    expect(statuses).toEqual(["SUBSCRIBED", "CHANNEL_ERROR"]);

    stopBoard();
    unsubscribe();
    vi.useRealTimers();
  });

  it("reconnects only when a hidden tab becomes visible again", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, listener: () => void) =>
        listeners.set(event, listener),
      ),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const realtime = fakeRealtime();

    const unsubscribe = subscribeToWorkspace(
      realtime.client,
      "workspace-1",
      () => undefined,
    );
    await settle();

    realtime.status("SUBSCRIBED");
    (globalThis.document as { visibilityState: string }).visibilityState =
      "visible";
    listeners.get("visibilitychange")?.();
    await settle();
    expect(realtime.client.channel).toHaveBeenCalledTimes(1);

    (globalThis.document as { visibilityState: string }).visibilityState =
      "hidden";
    realtime.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(realtime.client.channel).toHaveBeenCalledTimes(1);

    listeners.get("visibilitychange")?.();
    await settle();
    expect(realtime.client.channel).toHaveBeenCalledTimes(1);

    (globalThis.document as { visibilityState: string }).visibilityState =
      "visible";
    listeners.get("visibilitychange")?.();
    await settle();
    expect(realtime.client.channel).toHaveBeenCalledTimes(2);

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

  it("re-reads after the channel re-subscribes, never on the first join", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { visibilityState: "visible" });
    const realtime = fakeRealtime();
    const onResubscribed = vi.fn();

    const unsubscribe = subscribeToWorkspace(
      realtime.client,
      "workspace-1",
      () => undefined,
      { onResubscribed },
    );
    await settle();
    realtime.status("SUBSCRIBED");
    expect(onResubscribed).not.toHaveBeenCalled();

    realtime.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    realtime.status("SUBSCRIBED");
    expect(onResubscribed).toHaveBeenCalledTimes(1);

    unsubscribe();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for the leaving channel before re-joining the fixed topic", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { visibilityState: "visible" });
    const realtime = fakeRealtime();
    const order: string[] = [];
    let releaseRemoval: () => void = () => undefined;
    vi.mocked(realtime.client.removeChannel).mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("remove");
          releaseRemoval = () => {
            order.push("removed");
            resolve("ok");
          };
        }),
    );
    vi.mocked(realtime.client.channel).mockImplementation(((topic: string) => {
      order.push(`join ${topic}`);
      return realtime.channel;
    }) as never);

    const unsubscribe = subscribeToWorkspace(
      realtime.client,
      "workspace-1",
      () => undefined,
    );
    await settle();
    realtime.status("SUBSCRIBED");
    realtime.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(order).toEqual(["join workspace:workspace-1", "remove"]);

    releaseRemoval();
    await settle();
    expect(order).toEqual([
      "join workspace:workspace-1",
      "remove",
      "removed",
      "join workspace:workspace-1",
    ]);

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

  it("skips the interval tick while realtime is healthy but still catches up on return", () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, listener: () => void) =>
        listeners.set(event, listener),
      ),
      removeEventListener: vi.fn((event: string) => listeners.delete(event)),
    });
    let healthy = true;
    const refresh = vi.fn();
    const catchUp = createLiveCatchUp(refresh, {
      intervalMs: 30_000,
      minGapMs: 10_000,
      isVisible: () => true,
      isRealtimeHealthy: () => healthy,
    });

    catchUp.start();
    vi.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();

    // A tab returning from the background may have missed events.
    listeners.get("visibilitychange")?.();
    expect(refresh).toHaveBeenCalledTimes(1);
    // ...but focus noise inside the minimum gap is not another refetch.
    vi.advanceTimersByTime(5_000);
    listeners.get("focus")?.();
    expect(refresh).toHaveBeenCalledTimes(1);

    // The interval resumes when realtime is not healthy.
    healthy = false;
    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    catchUp.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("re-reads only conversations that changed since the last look", async () => {
    vi.useFakeTimers();
    let visible = true;
    const responses: Array<Array<{ id: string; updatedAt: string }>> = [
      [
        { id: "c1", updatedAt: "2026-11-03T10:00:00.000Z" },
        { id: "c2", updatedAt: "2026-11-03T09:00:00.000Z" },
      ],
      [{ id: "c1", updatedAt: "2026-11-03T10:00:00.000Z" }],
      [
        { id: "c2", updatedAt: "2026-11-03T10:05:00.000Z" },
        { id: "c1", updatedAt: "2026-11-03T10:00:00.000Z" },
      ],
    ];
    const since: Array<string | null> = [];
    const fetchSince = vi.fn(async (value: string | null) => {
      since.push(value);
      return responses.shift() ?? [];
    });
    const changed: string[][] = [];
    const watch = createConversationWatch(
      fetchSince,
      (ids) => changed.push(ids),
      { intervalMs: 15_000, overlapMs: 60_000, isVisible: () => visible },
    );

    watch.start();
    await settle();
    // The first look only records where things stand.
    expect(changed).toEqual([]);
    expect(since).toEqual([null]);

    await vi.advanceTimersByTimeAsync(15_000);
    // Overlap window: the newest stamp minus a minute.
    expect(since[1]).toBe("2026-11-03T09:59:00.000Z");
    expect(changed).toEqual([]);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(changed).toEqual([["c2"]]);

    // Hidden tabs do not poll.
    visible = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchSince).toHaveBeenCalledTimes(3);

    watch.stop();
    visible = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchSince).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("keeps watching after a failed look", async () => {
    vi.useFakeTimers();
    const fetchSince = vi
      .fn<
        (since: string | null) => Promise<{ id: string; updatedAt: string }[]>
      >()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([
        { id: "c1", updatedAt: "2026-11-03T10:00:00.000Z" },
      ])
      .mockResolvedValueOnce([
        { id: "c1", updatedAt: "2026-11-03T10:01:00.000Z" },
      ]);
    const onChanged = vi.fn();
    const watch = createConversationWatch(fetchSince, onChanged, {
      intervalMs: 15_000,
      isVisible: () => true,
    });
    watch.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onChanged).toHaveBeenCalledWith(["c1"]);
    watch.stop();
    vi.useRealTimers();
  });
});
