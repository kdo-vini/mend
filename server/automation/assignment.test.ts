import { describe, expect, it, vi } from "vitest";
import { assignConversationToActiveMember } from "./assignment.js";

describe("AI conversation assignment", () => {
  it("calls the atomic workspace assignment operation and returns its result", async () => {
    const rpc = vi.fn(async () => ({
      data: { status: "assigned", assignee_user_id: "agent-1" },
      error: null,
    }));

    await expect(
      assignConversationToActiveMember(
        { rpc } as never,
        "workspace-1",
        "conversation-1",
      ),
    ).resolves.toEqual({ status: "assigned", assigneeUserId: "agent-1" });
    expect(rpc).toHaveBeenCalledWith("assign_unassigned_conversation", {
      p_workspace_id: "workspace-1",
      p_conversation_id: "conversation-1",
    });
  });

  it("surfaces assignment persistence errors", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "database unavailable" },
    }));

    await expect(
      assignConversationToActiveMember(
        { rpc } as never,
        "workspace-1",
        "conversation-1",
      ),
    ).rejects.toThrow("database unavailable");
  });
});
