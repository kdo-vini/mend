const CONVERSATION_PARAM = "conversation";

/** Conversation id carried by a `?conversation=` URL, if any. */
export function parseConversationParam(search: string): string | null {
  const value = new URLSearchParams(search).get(CONVERSATION_PARAM);
  return value?.trim() ? value : null;
}

/** `search` with the selected conversation set (or removed), other params kept. */
export function withConversationParam(
  search: string,
  conversationId: string | null,
): string {
  const params = new URLSearchParams(search);
  if (conversationId) params.set(CONVERSATION_PARAM, conversationId);
  else params.delete(CONVERSATION_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/**
 * A thread is marked read only when the operator chose it (click, keyboard,
 * link) — never because the layout auto-selected it.
 */
export function shouldMarkConversationRead(input: {
  selectedId: string | undefined;
  explicitId: string | null;
  unread: number;
  threadOnScreen: boolean;
}): boolean {
  return Boolean(
    input.selectedId &&
      input.selectedId === input.explicitId &&
      input.unread > 0 &&
      input.threadOnScreen,
  );
}

/** In-flight older-history loads, tracked per conversation. */
export function createOlderLoadTracker() {
  const loading = new Set<string>();
  return {
    isLoading: (conversationId: string) => loading.has(conversationId),
    start(conversationId: string): boolean {
      if (loading.has(conversationId)) return false;
      loading.add(conversationId);
      return true;
    },
    finish: (conversationId: string) => void loading.delete(conversationId),
  };
}

/** The scroll anchor only applies while the loaded thread is still open. */
export function shouldCorrectOlderScroll(
  loadedConversationId: string,
  selectedConversationId: string | undefined,
): boolean {
  return loadedConversationId === selectedConversationId;
}
