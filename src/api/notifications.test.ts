import { describe, expect, it, vi } from "vitest";
import {
  dismissWorkspaceNotification,
  dismissWorkspaceNotifications,
} from "./notifications";
import type { MendSupabaseClient } from "../lib/supabase";

function createClient() {
  const result = Promise.resolve({ error: null });
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => result),
    then: result.then.bind(result),
  };
  return {
    client: { from: vi.fn(() => chain) } as unknown as MendSupabaseClient,
    chain,
  };
}

describe("notification dismissal", () => {
  it("deletes one notification from the workspace", async () => {
    const { client, chain } = createClient();

    await dismissWorkspaceNotification(client, "workspace-1", "notification-1");

    expect(chain.delete).toHaveBeenCalledOnce();
    expect(chain.eq).toHaveBeenNthCalledWith(1, "workspace_id", "workspace-1");
    expect(chain.eq).toHaveBeenNthCalledWith(2, "id", "notification-1");
  });

  it("deletes all unread notifications from the workspace", async () => {
    const { client, chain } = createClient();

    await dismissWorkspaceNotifications(client, "workspace-1");

    expect(chain.delete).toHaveBeenCalledOnce();
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(chain.is).toHaveBeenCalledWith("read_at", null);
  });
});
