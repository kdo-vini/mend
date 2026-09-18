import { describe, expect, it } from "vitest";
import { workspaceRefreshTarget } from "./live-workspace-sync";

describe("workspace refresh planning", () => {
  it("targets conversation and notification changes without a workspace snapshot", () => {
    expect(
      workspaceRefreshTarget({
        table: "messages",
        new: { conversation_id: "conversation-1" },
      }),
    ).toEqual({ kind: "conversation", id: "conversation-1" });
    expect(
      workspaceRefreshTarget({
        table: "conversations",
        new: { id: "conversation-2" },
      }),
    ).toEqual({ kind: "conversation", id: "conversation-2" });
    expect(workspaceRefreshTarget({ table: "notifications", new: {} })).toEqual(
      { kind: "notifications" },
    );
  });

  it("coalesces the remaining domain tables into a bounded workspace refresh", () => {
    expect(workspaceRefreshTarget({ table: "agent_runs", new: {} })).toEqual({
      kind: "workspace",
    });
    expect(
      workspaceRefreshTarget({ table: "knowledge_articles", new: {} }),
    ).toEqual({ kind: "workspace" });
  });
});
