import { describe, expect, it } from "vitest";
import { resolvePreferredLocale } from "./preferences";

describe("interface language precedence", () => {
  it("prefers persisted, then local choice, then Portuguese", () => {
    expect(resolvePreferredLocale("pt-BR", "en-US")).toBe("pt-BR");
    expect(resolvePreferredLocale("en-US", "pt-BR")).toBe("en-US");
    expect(resolvePreferredLocale(undefined, "en-US")).toBe("en-US");
    expect(resolvePreferredLocale(undefined, "pt-BR")).toBe("pt-BR");
    expect(resolvePreferredLocale()).toBe("pt-BR");
  });

  it("normalizes the legacy English alias", () => {
    expect(resolvePreferredLocale("en")).toBe("en-US");
  });
});
