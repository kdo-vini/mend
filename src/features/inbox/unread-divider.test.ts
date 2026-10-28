import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { firstUnreadMessageId } from "./unread-divider";

const message = (id: string, direction: Message["direction"]): Message => ({
  id,
  conversationId: "c-1",
  direction,
  sender: direction === "inbound" ? "Cliente" : "Você",
  text: id,
  time: "10:00",
  type: "text",
});

const thread = [
  message("in-1", "inbound"),
  message("out-1", "outbound"),
  message("in-2", "inbound"),
  message("in-3", "inbound"),
];

describe("firstUnreadMessageId", () => {
  it("marks the oldest of the unread customer messages", () => {
    expect(firstUnreadMessageId(thread, 2)).toBe("in-2");
    expect(firstUnreadMessageId(thread, 3)).toBe("in-1");
  });

  it("marks nothing when the thread is read", () => {
    expect(firstUnreadMessageId(thread, 0)).toBeUndefined();
  });

  it("falls back to the oldest loaded customer message", () => {
    expect(firstUnreadMessageId(thread, 10)).toBe("in-1");
    expect(firstUnreadMessageId([message("out-1", "outbound")], 1)).toBe(
      undefined,
    );
  });
});
