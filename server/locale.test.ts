import { describe, expect, it } from "vitest";
import { normalizeLocale, replyLanguageInstruction } from "./locale.js";

describe("server locale defaults", () => {
  it("falls back to Brazilian Portuguese and accepts the English aliases", () => {
    expect(normalizeLocale(undefined)).toBe("pt-BR");
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("en")).toBe("en-US");
    expect(normalizeLocale("en-US")).toBe("en-US");
    expect(normalizeLocale("es-MX")).toBe("pt-BR");
  });

  it("keeps operational reply instructions separate and explicit", () => {
    expect(replyLanguageInstruction("pt-BR")).toContain("Brazilian Portuguese");
    expect(replyLanguageInstruction("en-US")).toContain("US English");
  });
});
