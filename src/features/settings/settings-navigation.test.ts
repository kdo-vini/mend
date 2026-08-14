import { describe, expect, it } from "vitest";
import {
  findSettingsNavItem,
  legacySettingsPath,
  legacySettingsRoute,
  settingsNavigation,
} from "./settings-navigation";

describe("settings navigation", () => {
  it("maps legacy tab links to focused routes", () => {
    expect(legacySettingsPath("whatsapp")).toBe("/settings/channels/whatsapp");
    expect(legacySettingsPath("members")).toBe("/settings/team");
    expect(legacySettingsPath("ai")).toBe("/settings/automation/replies");
    expect(legacySettingsPath("flows")).toBe("/settings/automation/intake");
    expect(legacySettingsPath("repositories")).toBe(
      "/settings/engineering/repositories",
    );
    expect(legacySettingsPath("connections")).toBe("/settings/integrations");
    expect(legacySettingsPath("audit")).toBe("/settings/audit");
    expect(legacySettingsPath("unknown")).toBeNull();
  });

  it("keeps settings outcome-oriented and compact", () => {
    expect(
      settingsNavigation.map((group) => ({
        id: group.id,
        items: group.items.map((item) => item.id),
      })),
    ).toEqual([
      { id: "workspace", items: ["overview", "team", "audit"] },
      { id: "support", items: ["whatsapp", "automation"] },
      { id: "engineering", items: ["repositories", "agents"] },
      { id: "connections", items: ["integrations"] },
    ]);
  });

  it("uses canonical paths and stable nested match prefixes", () => {
    expect(settingsNavigation.flatMap((group) => group.items)).toMatchObject([
      {
        id: "overview",
        path: "/settings",
        matchPrefix: "/settings",
      },
      {
        id: "team",
        path: "/settings/team",
        matchPrefix: "/settings/team",
      },
      {
        id: "audit",
        path: "/settings/audit",
        matchPrefix: "/settings/audit",
      },
      {
        id: "whatsapp",
        path: "/settings/channels/whatsapp",
        matchPrefix: "/settings/channels/whatsapp",
      },
      {
        id: "automation",
        path: "/settings/automation/replies",
        matchPrefix: "/settings/automation",
      },
      {
        id: "repositories",
        path: "/settings/engineering/repositories",
        matchPrefix: "/settings/engineering/repositories",
      },
      {
        id: "agents",
        path: "/settings/engineering/agents/issues/providers",
        matchPrefix: "/settings/engineering/agents",
      },
      {
        id: "integrations",
        path: "/settings/integrations",
        matchPrefix: "/settings/integrations",
      },
    ]);
  });

  it("matches nested settings pages to one stable navigation item", () => {
    expect(findSettingsNavItem("/settings/automation/intake").id).toBe(
      "automation",
    );
    expect(
      findSettingsNavItem("/settings/engineering/agents/issues/run-policy").id,
    ).toBe("agents");
    expect(findSettingsNavItem("/settings/integrations/mcp").id).toBe(
      "integrations",
    );
    expect(findSettingsNavItem("/settings").id).toBe("overview");
  });

  it("redirects old implementation-shaped routes", () => {
    expect(
      legacySettingsRoute(
        "/settings/engineering/coding/connections",
        "?demo=1",
      ),
    ).toBe("/settings/engineering/agents/issues/providers?demo=1");
    expect(legacySettingsRoute("/settings/automation/flows", "?demo=1")).toBe(
      "/settings/automation/intake?demo=1",
    );
    expect(
      legacySettingsRoute("/settings/automation/replies", "?demo=1"),
    ).toBeNull();
  });

  it.each([
    ["/settings/automation/ai", "/settings/automation/replies"],
    ["/settings/automation/flows", "/settings/automation/intake"],
    [
      "/settings/engineering/coding/connections",
      "/settings/engineering/agents/issues/providers",
    ],
    [
      "/settings/engineering/coding/routing",
      "/settings/engineering/agents/issues/run-policy",
    ],
  ])("preserves the complete query when redirecting %s", (from, to) => {
    expect(legacySettingsRoute(from, "?demo=1&source=bookmark")).toBe(
      `${to}?demo=1&source=bookmark`,
    );
  });
});
