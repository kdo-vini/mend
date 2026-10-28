export const COMPOSER_DRAFTS_STORAGE_KEY = "mend.inbox-drafts";
/** A draft nobody came back to in a week is noise, not work in progress. */
export const COMPOSER_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_DRAFTS = 50;

type StoredDraft = { text: string; savedAt: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readAll(storage: StorageLike | undefined, now: number) {
  const drafts = new Map<string, StoredDraft>();
  if (!storage) return drafts;
  try {
    const parsed = JSON.parse(
      storage.getItem(COMPOSER_DRAFTS_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    for (const [conversationId, value] of Object.entries(parsed)) {
      const draft = value as Partial<StoredDraft> | null;
      if (
        typeof draft?.text === "string" &&
        draft.text &&
        typeof draft.savedAt === "number" &&
        now - draft.savedAt < COMPOSER_DRAFT_TTL_MS
      )
        drafts.set(conversationId, {
          text: draft.text,
          savedAt: draft.savedAt,
        });
    }
  } catch {
    // A corrupt entry only costs the drafts, never the inbox.
  }
  return drafts;
}

function writeAll(
  storage: StorageLike | undefined,
  drafts: Map<string, StoredDraft>,
) {
  if (!storage) return;
  try {
    if (!drafts.size) {
      storage.removeItem(COMPOSER_DRAFTS_STORAGE_KEY);
      return;
    }
    const newest = [...drafts.entries()]
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, MAX_STORED_DRAFTS);
    storage.setItem(
      COMPOSER_DRAFTS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(newest)),
    );
  } catch {
    // Full or blocked storage: the draft still lives in memory this session.
  }
}

/**
 * Per-conversation composer text. Memory answers instantly while the page is
 * open; the browser copy brings a half-written reply back after a reload.
 */
export function createComposerDrafts(storage = browserStorage()) {
  const memory = new Map<string, string>();
  for (const [conversationId, draft] of readAll(storage, Date.now()))
    memory.set(conversationId, draft.text);
  return {
    get(conversationId: string) {
      return memory.get(conversationId);
    },
    set(conversationId: string, text: string) {
      const now = Date.now();
      const stored = readAll(storage, now);
      if (text.trim()) {
        memory.set(conversationId, text);
        stored.set(conversationId, { text, savedAt: now });
      } else {
        memory.delete(conversationId);
        stored.delete(conversationId);
      }
      writeAll(storage, stored);
    },
  };
}
