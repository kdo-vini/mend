import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPOSER_DRAFT_TTL_MS,
  COMPOSER_DRAFTS_STORAGE_KEY,
  createComposerDrafts,
} from "./composer-drafts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("composer drafts", () => {
  afterEach(() => vi.useRealTimers());

  it("brings a half-written reply back after a reload", () => {
    const storage = memoryStorage();
    createComposerDrafts(storage).set("c-1", "Oi, já verifiquei");

    const afterReload = createComposerDrafts(storage);
    expect(afterReload.get("c-1")).toBe("Oi, já verifiquei");
    expect(afterReload.get("c-2")).toBeUndefined();
  });

  it("forgets a draft once the composer is cleared", () => {
    const storage = memoryStorage();
    const drafts = createComposerDrafts(storage);
    drafts.set("c-1", "rascunho");
    drafts.set("c-1", "   ");

    expect(drafts.get("c-1")).toBeUndefined();
    expect(storage.values.has(COMPOSER_DRAFTS_STORAGE_KEY)).toBe(false);
  });

  it("drops drafts older than a week", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    createComposerDrafts(storage).set("c-1", "antigo");
    vi.advanceTimersByTime(COMPOSER_DRAFT_TTL_MS + 1);

    expect(createComposerDrafts(storage).get("c-1")).toBeUndefined();
  });

  it("survives corrupt or missing storage", () => {
    const storage = memoryStorage();
    storage.setItem(COMPOSER_DRAFTS_STORAGE_KEY, "{not json");
    expect(createComposerDrafts(storage).get("c-1")).toBeUndefined();

    const noStorage = createComposerDrafts(undefined);
    noStorage.set("c-1", "só na memória");
    expect(noStorage.get("c-1")).toBe("só na memória");
  });
});
