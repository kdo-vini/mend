import { describe, expect, it } from "vitest";
import { appLocale, resources } from "./resources";

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

describe("i18n catalogs", () => {
  it("ships only the Portuguese interface", () => {
    expect(Object.keys(resources)).toEqual([appLocale]);
  });

  it("has copy for every key", () => {
    for (const [namespace, catalog] of Object.entries(resources[appLocale])) {
      for (const [key, value] of Object.entries(flatten(catalog)))
        expect(value.trim(), `${namespace}.${key}`).not.toBe("");
    }
  });
});
