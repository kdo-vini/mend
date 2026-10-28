import type { Message } from "../../types";

/**
 * The first message the operator has not read yet: the oldest of the last
 * `unreadCount` customer messages. Undefined when nothing is unread or the
 * unread messages are not loaded.
 */
export function firstUnreadMessageId(
  messages: readonly Message[],
  unreadCount: number,
): string | undefined {
  if (unreadCount <= 0) return undefined;
  let remaining = unreadCount;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction !== "inbound") continue;
    remaining -= 1;
    if (remaining === 0) return message.id;
  }
  // Fewer inbound messages loaded than unread: the marker would sit on the
  // wrong bubble, so the oldest loaded inbound one takes it.
  return messages.find((message) => message.direction === "inbound")?.id;
}
