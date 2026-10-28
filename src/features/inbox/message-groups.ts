import type { Message } from "../../types";

/** Messages closer than this read as one burst, like on WhatsApp. */
export const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * True when `message` follows `previous` from the same sender within a few
 * minutes, so the thread can drop the repeated name and tighten the spacing.
 */
export function continuesGroup(
  previous: Message | undefined,
  message: Message,
) {
  if (!previous || previous.direction !== message.direction) return false;
  if (previous.sender !== message.sender) return false;
  if (previous.senderUserId !== message.senderUserId) return false;
  if (Boolean(previous.aiGenerated) !== Boolean(message.aiGenerated))
    return false;
  const before = Date.parse(previous.createdAt ?? "");
  const after = Date.parse(message.createdAt ?? "");
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
  return after - before >= 0 && after - before <= MESSAGE_GROUP_WINDOW_MS;
}
