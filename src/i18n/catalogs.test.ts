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
    expect(supportedLocales).toEqual(["pt-BR", "en-US"]);
    expect(normalizeLocale("en")).toBe("en-US");
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("es")).toBe("pt-BR");
    expect(normalizeLocale(undefined)).toBe("pt-BR");
  });

  it("keeps common keys, values and placeholders complete", () => {
    const portugueseResources = resources["pt-BR"] as Record<string, unknown>;
    for (const [namespace, portugueseCatalog] of Object.entries(
      portugueseResources,
    )) {
      const portuguese = flatten(portugueseCatalog);
      const english = flatten(
        (resources["en-US"] as Record<string, unknown>)[namespace],
      );
      expect(Object.keys(english).sort(), namespace).toEqual(
        Object.keys(portuguese).sort(),
      );
      for (const key of Object.keys(portuguese)) {
        expect(english[key], `${namespace}.${key}`).toBeTruthy();
        expect(placeholders(english[key] ?? ""), `${namespace}.${key}`).toEqual(
          placeholders(portuguese[key] ?? ""),
        );
      }
    }
  });
});
