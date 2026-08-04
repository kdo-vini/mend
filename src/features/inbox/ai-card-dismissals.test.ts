import { describe, expect, it } from "vitest";
import {
  dismissAiCard,
  isAiCardDismissed,
  readAiCardDismissals,
  writeAiCardDismissals,
} from "./ai-card-dismissals";

describe("AI card dismissals", () => {
  it("keeps a dismissal scoped to the conversation, card, and content version", () => {
    const dismissed = dismissAiCard({}, "conversation-1", "draft", "draft-1");

    expect(
      isAiCardDismissed(dismissed, "conversation-1", "draft", "draft-1"),
    ).toBe(true);
    expect(
      isAiCardDismissed(dismissed, "conversation-2", "draft", "draft-1"),
    ).toBe(false);
    expect(
      isAiCardDismissed(dismissed, "conversation-1", "decision", "draft-1"),
    ).toBe(false);
    expect(
      isAiCardDismissed(dismissed, "conversation-1", "draft", "draft-2"),
    ).toBe(false);
  });

  it("round-trips valid dismissals and ignores malformed storage entries", () => {
    const storage = new Map<string, string>();
    const browserStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Storage;
    const dismissals = dismissAiCard(
      {},
      "conversation-1",
      "decision",
      "decision-1",
    );

    writeAiCardDismissals(browserStorage, "mend.ai-cards", dismissals);
    expect(readAiCardDismissals(browserStorage, "mend.ai-cards")).toEqual(
      dismissals,
    );

    storage.set("mend.ai-cards", '{"valid":"signature","bad":42}');
    expect(readAiCardDismissals(browserStorage, "mend.ai-cards")).toEqual({
      valid: "signature",
    });
  });
});
