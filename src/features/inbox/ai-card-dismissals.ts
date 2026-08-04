export type AiCardKind = "decision" | "draft";

export type AiCardDismissals = Record<string, string>;

export function getAiCardDismissalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function dismissalKey(conversationId: string, kind: AiCardKind) {
  return `${conversationId}:${kind}`;
}

export function isAiCardDismissed(
  dismissals: AiCardDismissals,
  conversationId: string,
  kind: AiCardKind,
  signature: string,
) {
  return dismissals[dismissalKey(conversationId, kind)] === signature;
}

export function dismissAiCard(
  dismissals: AiCardDismissals,
  conversationId: string,
  kind: AiCardKind,
  signature: string,
): AiCardDismissals {
  return {
    ...dismissals,
    [dismissalKey(conversationId, kind)]: signature,
  };
}

export function readAiCardDismissals(
  storage: Storage | undefined,
  key: string,
): AiCardDismissals {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([entryKey, value]) => entryKey.length > 0 && typeof value === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function writeAiCardDismissals(
  storage: Storage | undefined,
  key: string,
  dismissals: AiCardDismissals,
) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(dismissals));
  } catch {
    // Browser storage can be unavailable or full; the in-memory state still works.
  }
}
