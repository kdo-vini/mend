import { describe, expect, it } from "vitest";
import {
  findSettingsNavItem,
  legacySettingsPath,
  settingsNavigation,
} from "./settings-navigation";

describe("settings navigation", () => {
  it("maps legacy tab links to focused routes", () => {
    expect(legacySettingsPath("repositories")).toBe(
      "/settings/engineering/repositories",
    );
    expect(legacySettingsPath("connections")).toBe("/settings/integrations");
    expect(legacySettingsPath("unknown")).toBeNull();
  });

  it("keeps every domain reachable from the settings tree", () => {
    const ids = settingsNavigation.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "overview",
        "whatsapp",
        "team",
        "ai",
        "flows",
        "integrations",
        "github",
        "google",
        "mcp",
        "repositories",
        "coding-connections",
        "coding-routing",
        "audit",
      ]),
    );
  });

  it("marks nested pages as belonging to their focused navigation item", () => {
    expect(findSettingsNavItem("/settings/engineering/repositories").id).toBe(
      "repositories",
    );
    expect(findSettingsNavItem("/settings/engineering/coding/routing").id).toBe(
      "coding-routing",
    );
    expect(findSettingsNavItem("/settings").id).toBe("overview");
  });
});
