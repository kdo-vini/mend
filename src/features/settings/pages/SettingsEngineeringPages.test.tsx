// @vitest-environment jsdom
// i18n-exempt: test renders translated output via the shared i18n instance directly, not useTranslation().

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { LiveActionError } from "../../../api/transport";
import type { LiveAgentConnection } from "../api";
import { catalogFailurePresentation } from "../catalog-errors";
import { ProviderComparisonTable } from "./SettingsEngineeringPages";

const connections: LiveAgentConnection[] = [
  {
    id: "connection-api",
    workspaceId: "workspace-1",
    label: "Production provider",
    provider: "openai",
    authMethod: "api_key",
    purpose: "coding",
    status: "connected",
    automationConsent: false,
    catalog: {
      connectionId: "connection-api",
      provider: "openai",
      cliVersion: "1.0.0",
      models: [{ id: "gpt-5" }, { id: "gpt-5-mini" }],
      source: "provider",
      lastVerifiedAt: "2026-08-13T12:00:00.000Z",
      expiresAt: "2026-08-14T12:00:00.000Z",
    },
  },
  {
    id: "connection-subscription",
    workspaceId: "workspace-1",
    label: "Production provider",
    provider: "openai",
    authMethod: "subscription",
    purpose: "coding",
    status: "pending",
    automationConsent: false,
  },
];

describe("ProviderComparisonTable", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  it("keeps duplicate labels as independent comparison rows with actions", async () => {
    const container = document.createElement("div");
    const catalogedIds: string[] = [];
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProviderComparisonTable
          connections={connections}
          action={null}
          onCatalog={(connection) => catalogedIds.push(connection.id)}
          onVerify={() => undefined}
          onRevoke={() => undefined}
          onAutomationConsent={() => undefined}
        />,
      );
    });

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(container.querySelectorAll("tbody strong")[0]?.textContent).toBe(
      "Production provider",
    );
    expect(container.querySelectorAll("tbody strong")[2]?.textContent).toBe(
      "Production provider",
    );
    expect(
      container.querySelectorAll('td[data-label="Authentication"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('button[aria-haspopup="menu"]'),
    ).toHaveLength(2);
    expect(container.textContent).toContain("2 models");
    expect(container.textContent).toContain("Pending");

    await act(async () => {
      rows[0]
        ?.querySelector<HTMLButtonElement>(
          ".settings-provider-desktop-actions button",
        )
        ?.click();
      rows[1]
        ?.querySelector<HTMLButtonElement>(
          ".settings-provider-desktop-actions button",
        )
        ?.click();
    });
    expect(catalogedIds).toEqual(["connection-api", "connection-subscription"]);
    await act(async () => root.unmount());
  });

  it("disables actions only for the row matching the pending connection id", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProviderComparisonTable
          connections={connections}
          action="connection-api"
          onCatalog={() => undefined}
          onVerify={() => undefined}
          onRevoke={() => undefined}
          onAutomationConsent={() => undefined}
        />,
      );
    });

    const rows = container.querySelectorAll("tbody tr");
    const pendingButtons = rows[0]?.querySelectorAll<HTMLButtonElement>(
      ".settings-provider-desktop-actions button",
    );
    const idleButtons = rows[1]?.querySelectorAll<HTMLButtonElement>(
      ".settings-provider-desktop-actions button",
    );
    expect(
      Array.from(pendingButtons ?? []).every((button) => button.disabled),
    ).toBe(true);
    expect(
      Array.from(idleButtons ?? []).some((button) => button.disabled),
    ).toBe(false);

    await act(async () => root.unmount());
  });
});

describe("catalogFailurePresentation", () => {
  it.each([
    [
      new LiveActionError(
        "credential rejected",
        422,
        "agent_catalog_credential_invalid",
      ),
      { status: "error", messageKey: "catalogCredential" },
    ],
    [
      new LiveActionError(
        "provider unavailable",
        502,
        "agent_catalog_provider_unavailable",
      ),
      { status: "error", messageKey: "catalogUnavailable" },
    ],
    [
      new LiveActionError(
        "connection revoked",
        409,
        "agent_connection_revoked",
      ),
      { status: "revoked", messageKey: "catalogRevoked" },
    ],
  ])(
    "maps status and code to an actionable localized state",
    (error, expected) => {
      expect(catalogFailurePresentation(error)).toEqual(expected);
    },
  );
});
