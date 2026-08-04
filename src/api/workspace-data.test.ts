import { describe, expect, it, vi } from "vitest";
import {
  subscribeToWorkspace,
  workspaceRealtimeTables,
} from "./workspace-data";
import type { MendSupabaseClient } from "../lib/supabase";

describe("workspace realtime subscriptions", () => {
  it("subscribes to every live workspace surface and refetches after reconnect", () => {
    const handlers: Array<(payload: unknown) => void> = [];
    let statusCallback: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn(
        (
          _event: string,
          _filter: unknown,
          handler: (payload: unknown) => void,
        ) => {
          handlers.push(handler);
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
      { reconnect: false },
    );

    expect(channel.on).toHaveBeenCalledTimes(workspaceRealtimeTables.length);
    expect(workspaceRealtimeTables).toContain("messages");
    expect(workspaceRealtimeTables).toContain("knowledge_articles");
    expect(workspaceRealtimeTables).toContain("contacts");
    expect(workspaceRealtimeTables).toContain("issue_messages");

    statusCallback?.("SUBSCRIBED");
    expect(changes).toHaveLength(1);
    expect((changes[0] as { table: string }).table).toBe("*");
    handlers[0]?.({ eventType: "INSERT", table: "messages" });
    expect(changes).toHaveLength(2);

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
