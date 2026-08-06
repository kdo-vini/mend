import { describe, expect, it } from "vitest";
import { resolvePreferredLocale } from "./preferences";

describe("interface language precedence", () => {
  it("prefers persisted, then workspace, then local, then English", () => {
    expect(resolvePreferredLocale("pt-BR", "en-US", "en-US")).toBe("pt-BR");
    expect(resolvePreferredLocale(undefined, "pt-BR", "en-US")).toBe("pt-BR");
    expect(resolvePreferredLocale(undefined, undefined, "pt-BR")).toBe("pt-BR");
    expect(resolvePreferredLocale()).toBe("en-US");
  });

  it("normalizes the legacy English alias", () => {
    expect(resolvePreferredLocale("en")).toBe("en-US");
  });
});
