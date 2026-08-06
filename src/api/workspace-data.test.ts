import { describe, expect, it, vi } from "vitest";
import {
  createRealtimeFallback,
  subscribeToWorkspace,
  workspaceRealtimeTables,
} from "./workspace-data";
import type { MendSupabaseClient } from "../lib/supabase";

describe("workspace realtime subscriptions", () => {
  it("subscribes to every live workspace surface and refetches after reconnect", () => {
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
    expect(workspaceRealtimeTables).toContain("knowledge_articles");
    expect(workspaceRealtimeTables).toContain("contacts");
    expect(workspaceRealtimeTables).toContain("issue_messages");
    expect(workspaceRealtimeTables).not.toContain("ai_draft_knowledge");
    expect(registrations.every((item) => !("filter" in item.options))).toBe(
      true,
    );

    statusCallback?.("SUBSCRIBED");
    expect(changes).toHaveLength(1);
    expect((changes[0] as { table: string }).table).toBe("*");
    expect(statuses).toEqual(["SUBSCRIBED"]);
    registrations
      .find((item) => item.options.table === "messages")
      ?.handler({ eventType: "INSERT", table: "messages" });
    expect(changes).toHaveLength(2);

    const messagesHandler = registrations.find(
      (item) => item.options.table === "messages",
    )?.handler;
    messagesHandler?.({ new: { workspace_id: "other" }, old: {} });
    expect(changes).toHaveLength(2);
    messagesHandler?.({ new: { workspace_id: "workspace-1" }, old: {} });
    expect(changes).toHaveLength(3);

    statusCallback?.("CHANNEL_ERROR");
    expect(statuses).toEqual(["SUBSCRIBED", "CHANNEL_ERROR"]);

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("reconnects only when a hidden tab becomes visible again", () => {
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
      subscribe: vi.fn(),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as MendSupabaseClient;

    const unsubscribe = subscribeToWorkspace(
      client,
      "workspace-1",
      () => undefined,
      { reconnect: false },
    );

    listeners.get("visibilitychange")?.();
    expect(client.channel).toHaveBeenCalledTimes(1);

    (globalThis.document as { visibilityState: string }).visibilityState =
      "visible";
    listeners.get("visibilitychange")?.();
    expect(client.channel).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.unstubAllGlobals();
  });

  it("refreshes only while realtime is unhealthy and stops cleanly", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let healthy = false;
    const fallback = createRealtimeFallback(refresh, () => healthy);

    fallback.start();
    vi.advanceTimersByTime(4_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    healthy = true;
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    fallback.stop();
    healthy = false;
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
