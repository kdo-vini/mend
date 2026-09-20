import type { Conversation, Message } from "../../types";

/**
 * Human WhatsApp replies may be stored with the attending intro above the
 * composer body (`_*Name está te atendendo*_\n\n…`). Optimistic bubbles only
 * have the body — strip the intro so snapshot merge can retire `temp:` rows.
 */
export function stripHumanWhatsAppIntro(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const stripped = trimmed
    .replace(/^_\*[^*\n]+?\*_\s*\n+/, "")
    .replace(
      /^\*[^*\n]+?\*\s+(está te atendendo|is assisting you)\s*\n+/i,
      "",
    );
  return stripped.trim() || trimmed;
}

function messageMatchKey(message: Pick<Message, "direction" | "text">): string {
  return `${message.direction}:${stripHumanWhatsAppIntro(message.text)}`;
}

export function sortConversationMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || "") || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    const leftTemp = left.id.startsWith("temp:") ? 1 : 0;
    const rightTemp = right.id.startsWith("temp:") ? 1 : 0;
    if (leftTemp !== rightTemp) return leftTemp - rightTemp;
    return left.id.localeCompare(right.id);
  });
}

export function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.lastMessageAt || "") || 0;
    const leftTime = Date.parse(left.lastMessageAt || "") || 0;
    return rightTime - leftTime;
  });
}

function unmatchedOptimisticMessages(
  existing: Conversation | undefined,
  snapshotMessages: Message[],
): Message[] {
  const persistedTextCounts = new Map<string, number>();
  for (const message of snapshotMessages) {
    const key = messageMatchKey(message);
    persistedTextCounts.set(key, (persistedTextCounts.get(key) ?? 0) + 1);
  }
  return (existing?.messages ?? []).filter((message) => {
    if (!message.id.startsWith("temp:")) return false;
    const key = messageMatchKey(message);
    const remaining = persistedTextCounts.get(key) ?? 0;
    if (remaining > 0) {
      persistedTextCounts.set(key, remaining - 1);
      return false;
    }
    return true;
  });
}

function withPendingReactions(
  existing: Conversation | undefined,
  messages: Message[],
): Message[] {
  const pendingReactions = new Map(
    (existing?.messages ?? [])
      .filter((message) => message.pendingReaction !== undefined)
      .map((message) => [message.id, message]),
  );
  return messages.map((message) => {
    const pendingReaction = pendingReactions.get(message.id);
    return pendingReaction
      ? {
          ...message,
          reactions: pendingReaction.reactions,
          pendingReaction: pendingReaction.pendingReaction,
        }
      : message;
  });
}

function persistedMessages(messages: Message[]): Message[] {
  return messages.filter((message) => !message.id.startsWith("temp:"));
}

/**
 * Merges a server conversation into the local list.
 *
 * - `partialMessages: true` (inbox list embed): update metadata and upsert the
 *   latest bubble(s) only — never discard an already-hydrated thread.
 * - full snapshot: take server messages as the recent window, keep any older
 *   local rows the page did not include, and retire matched optimistic temps.
 */
export function mergeConversationSnapshot(
  current: Conversation[],
  snapshot: Conversation,
  options?: { partialMessages?: boolean },
): Conversation[] {
  const existing = current.find((item) => item.id === snapshot.id);
  const localPersisted = persistedMessages(existing?.messages ?? []);
  const snapshotPersisted = persistedMessages(snapshot.messages);
  const pending = unmatchedOptimisticMessages(existing, snapshot.messages);

  // List refreshes (and any strictly thinner page) must not wipe history that
  // the operator already has on screen — that is what made replies erase the
  // thread until a full page reload.
  const treatAsPartial =
    options?.partialMessages === true ||
    (localPersisted.length > 0 &&
      snapshotPersisted.length > 0 &&
      snapshotPersisted.length < localPersisted.length);

  let nextMessages: Message[];
  if (treatAsPartial && existing) {
    const byId = new Map(localPersisted.map((message) => [message.id, message]));
    for (const message of withPendingReactions(existing, snapshot.messages)) {
      if (message.id.startsWith("temp:")) continue;
      byId.set(message.id, message);
    }
    nextMessages = sortConversationMessages([...byId.values(), ...pending]);
  } else {
    const snapshotIds = new Set(snapshotPersisted.map((message) => message.id));
    const retainedHistory = localPersisted.filter(
      (message) => !snapshotIds.has(message.id),
    );
    nextMessages = sortConversationMessages([
      ...retainedHistory,
      ...withPendingReactions(existing, snapshot.messages),
      ...pending,
    ]);
  }

  const merged: Conversation = {
    ...snapshot,
    messages: nextMessages,
  };
  return sortConversations(
    existing
      ? current.map((item) => (item.id === snapshot.id ? merged : item))
      : [merged, ...current],
  );
}
