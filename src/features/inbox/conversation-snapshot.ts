import type { Conversation, Message } from "../../types";
import {
  conversationPreviewText,
  stripHumanWhatsAppIntro,
} from "../../shared/conversation-preview";

export {
  conversationPreviewText,
  stripHumanWhatsAppIntro,
} from "../../shared/conversation-preview";

function messageMatchKey(
  message: Pick<Message, "direction" | "text" | "type">,
): string {
  return `${message.direction}:${message.type}:${stripHumanWhatsAppIntro(message.text)}`;
}

/** Server and browser clocks differ; a persisted copy may look a bit older. */
const OPTIMISTIC_MATCH_SKEW_MS = 5 * 60_000;

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

/**
 * Optimistic bubbles still waiting for their persisted copy. A temp is retired
 * only by a row this merge brings in for the first time, written around or
 * after the temp: an older message with the same text used to retire a fresh
 * send, which then had nowhere to show "failed" or offer retry. Failed temps
 * stay until the operator retries, edits or cancels them.
 */
function unmatchedOptimisticMessages(
  existing: Conversation | undefined,
  snapshotMessages: Message[],
): Message[] {
  const known = new Set(
    (existing?.messages ?? []).map((message) => message.id),
  );
  const persisted = snapshotMessages.filter(
    (message) => !message.id.startsWith("temp:"),
  );
  const unseen = persisted.filter((message) => !known.has(message.id));
  const consumed = new Set<string>();
  const claim = (
    candidates: Message[],
    match: (candidate: Message) => boolean,
  ) => {
    const candidate = candidates.find(
      (item) => !consumed.has(item.id) && match(item),
    );
    if (candidate) consumed.add(candidate.id);
    return Boolean(candidate);
  };
  return (existing?.messages ?? []).filter((message) => {
    if (!message.id.startsWith("temp:")) return false;
    if (message.status === "failed") return true;
    const sentAt = Date.parse(message.createdAt ?? "");
    const recentEnough = (candidate: Message) => {
      const persistedAt = Date.parse(candidate.createdAt ?? "");
      return (
        Number.isNaN(sentAt) ||
        Number.isNaN(persistedAt) ||
        persistedAt >= sentAt - OPTIMISTIC_MATCH_SKEW_MS
      );
    };
    const key = messageMatchKey(message);
    // Uploaded attachments carry their batch onto the persisted row, so they
    // match by batch alone: a caption-less key would match any earlier photo.
    // The batch is written just after the row, so a row already on screen
    // can still be the one that retires its upload.
    const retired =
      message.mediaBatchId !== undefined
        ? claim(
            persisted,
            (candidate) =>
              candidate.mediaBatchId === message.mediaBatchId &&
              candidate.type === message.type,
          )
        : claim(
            unseen,
            (candidate) =>
              messageMatchKey(candidate) === key && recentEnough(candidate),
          );
    return !retired;
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
    const byId = new Map(
      localPersisted.map((message) => [message.id, message]),
    );
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
    lastMessage: conversationPreviewText(nextMessages.at(-1)),
  };
  return sortConversations(
    existing
      ? current.map((item) => (item.id === snapshot.id ? merged : item))
      : [merged, ...current],
  );
}
