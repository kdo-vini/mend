import type { Conversation } from "../../types";

export const inboxFilterValues = [
  "all",
  "unread",
  "needs_attention",
  "waiting_customer",
  "unassigned",
  "resolved",
] as const;

export type InboxFilter = (typeof inboxFilterValues)[number];

export function conversationMatchesInboxFilter(
  conversation: Conversation,
  filter: InboxFilter,
) {
  return (
    filter === "all" ||
    (filter === "unread" && conversation.unread > 0) ||
    (filter === "needs_attention" &&
      conversation.attention === "needs_attention") ||
    (filter === "waiting_customer" &&
      conversation.attention === "waiting_customer") ||
    (filter === "unassigned" && conversation.assignee === "Unassigned") ||
    (filter === "resolved" && conversation.status === "resolved")
  );
}
