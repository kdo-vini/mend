import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveRefreshBatcher,
  workspaceRefreshTarget,
} from "./live-workspace-sync";

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

  it("never hydrates the workspace for channel or contact churn", () => {
    expect(
      workspaceRefreshTarget({
        table: "channel_connections",
        new: { last_event_at: "2026-10-26T10:00:00Z" },
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      workspaceRefreshTarget({ table: "something_else", new: {} }),
    ).toEqual({ kind: "ignore" });
    expect(
      workspaceRefreshTarget({ table: "contacts", new: { id: "contact-1" } }),
    ).toEqual({ kind: "contact", id: "contact-1" });
    expect(workspaceRefreshTarget({ table: "contacts", old: {} })).toEqual({
      kind: "ignore",
    });
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

describe("live refresh batching", () => {
  afterEach(() => vi.useRealTimers());

  it("routes per-thread AI state and drafts to their conversation", () => {
    expect(
      workspaceRefreshTarget({
        table: "conversation_ai_state",
        new: { conversation_id: "conversation-1" },
      }),
    ).toEqual({ kind: "conversation", id: "conversation-1" });
    expect(
      workspaceRefreshTarget({
        table: "ai_drafts",
        old: { conversation_id: "conversation-2" },
      }),
    ).toEqual({ kind: "conversation", id: "conversation-2" });
    expect(workspaceRefreshTarget({ table: "ai_drafts", old: {} })).toEqual({
      kind: "workspace",
    });
  });

  it("collapses a burst of events from one send into a single refresh", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createLiveRefreshBatcher(flush, 300);
    for (let index = 0; index < 6; index += 1)
      batcher.add({ kind: "conversation", id: "conversation-1" });
    batcher.add({ kind: "conversation", id: "conversation-2" });
    batcher.add({ kind: "notifications" });
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith({
      workspace: false,
      notifications: true,
      conversationIds: ["conversation-1", "conversation-2"],
      contactIds: [],
    });

    batcher.add({ kind: "workspace" });
    batcher.add({ kind: "notifications" });
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenLastCalledWith({
      workspace: true,
      notifications: false,
      conversationIds: [],
      contactIds: [],
    });
  });

  it("collects contact targets and ignores noise without scheduling a flush", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createLiveRefreshBatcher(flush, 300);
    batcher.add({ kind: "ignore" });
    vi.advanceTimersByTime(1_000);
    expect(flush).not.toHaveBeenCalled();

    batcher.add({ kind: "contact", id: "contact-1" });
    batcher.add({ kind: "contact", id: "contact-1" });
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledWith({
      workspace: false,
      notifications: false,
      conversationIds: [],
      contactIds: ["contact-1"],
    });
  });

  it("drops pending work when stopped", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createLiveRefreshBatcher(flush, 300);
    batcher.add({ kind: "workspace" });
    batcher.stop();
    vi.advanceTimersByTime(1_000);
    expect(flush).not.toHaveBeenCalled();
  });
});
