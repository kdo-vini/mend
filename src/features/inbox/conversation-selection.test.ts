import { describe, expect, it } from "vitest";
import {
  createOlderLoadTracker,
  parseConversationParam,
  shouldCorrectOlderScroll,
  shouldMarkConversationRead,
  withConversationParam,
} from "./conversation-selection";

describe("conversation URL selection", () => {
  it("parses and restores the conversation id", () => {
    expect(parseConversationParam("?conversation=abc")).toBe("abc");
    expect(parseConversationParam("?x=1")).toBeNull();
    expect(parseConversationParam("?conversation=")).toBeNull();
    expect(withConversationParam("?x=1", "abc")).toBe("?x=1&conversation=abc");
    expect(withConversationParam("?conversation=a", "b")).toBe(
      "?conversation=b",
    );
    expect(withConversationParam("?conversation=a", null)).toBe("");
  });
});

describe("mark read", () => {
  const base = {
    selectedId: "a",
    explicitId: "a",
    unread: 2,
    threadOnScreen: true,
  };
  it("marks an explicitly selected unread thread", () => {
    expect(shouldMarkConversationRead(base)).toBe(true);
  });
  it("does not mark an auto-selected thread", () => {
    expect(shouldMarkConversationRead({ ...base, explicitId: null })).toBe(
      false,
    );
    expect(shouldMarkConversationRead({ ...base, explicitId: "b" })).toBe(
      false,
    );
  });
  it("does not mark when off screen or already read", () => {
    expect(shouldMarkConversationRead({ ...base, threadOnScreen: false })).toBe(
      false,
    );
    expect(shouldMarkConversationRead({ ...base, unread: 0 })).toBe(false);
  });
});

describe("older messages guard", () => {
  it("tracks loading per conversation", () => {
    const tracker = createOlderLoadTracker();
    expect(tracker.start("a")).toBe(true);
    expect(tracker.start("a")).toBe(false);
    expect(tracker.start("b")).toBe(true);
    tracker.finish("a");
    expect(tracker.isLoading("a")).toBe(false);
    expect(tracker.isLoading("b")).toBe(true);
  });
  it("skips scroll correction when the selection changed", () => {
    expect(shouldCorrectOlderScroll("a", "a")).toBe(true);
    expect(shouldCorrectOlderScroll("a", "b")).toBe(false);
  });
});
