/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import i18n from "./index";
import {
  applyInterfaceLanguage,
  interfaceLanguageStorageKey,
  resolvePreferredLocale,
} from "./preferences";

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

  it("updates the rendered document and storage when Profile changes language", async () => {
    await applyInterfaceLanguage("en-US");
    expect(i18n.language).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    expect(localStorage.getItem(interfaceLanguageStorageKey)).toBe("en-US");

    await applyInterfaceLanguage("pt-BR");
    expect(i18n.language).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(localStorage.getItem(interfaceLanguageStorageKey)).toBe("pt-BR");
  });
});
