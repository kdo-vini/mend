import { describe, expect, it } from "vitest";
import { normalizeLocale, resources, supportedLocales } from "./resources";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, child]) => ({
      ...result,
      ...flatten(child, prefix ? `${prefix}.${key}` : key),
    }),
    {},
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)]
    .map((match) => match[1] ?? "")
    .sort();
}

describe("i18n catalogs", () => {
  it("keeps the supported locale contract stable", () => {
    expect(supportedLocales).toEqual(["en-US", "pt-BR"]);
    expect(normalizeLocale("en")).toBe("en-US");
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("es")).toBe("en-US");
  });

  it("keeps common keys, values and placeholders complete", () => {
    const portugueseResources = resources["pt-BR"] as Record<string, unknown>;
    for (const [namespace, englishCatalog] of Object.entries(
      resources["en-US"],
    )) {
      const english = flatten(englishCatalog);
      const portuguese = flatten(portugueseResources[namespace]);
      expect(Object.keys(portuguese).sort(), namespace).toEqual(
        Object.keys(english).sort(),
      );
      for (const key of Object.keys(english)) {
        expect(portuguese[key], `${namespace}.${key}`).toBeTruthy();
        expect(
          placeholders(portuguese[key] ?? ""),
          `${namespace}.${key}`,
        ).toEqual(placeholders(english[key] ?? ""));
      }
    }
  });
});
