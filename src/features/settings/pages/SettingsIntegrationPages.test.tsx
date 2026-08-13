// @vitest-environment jsdom
// i18n-exempt: test renders translated output via the shared i18n instance directly, not useTranslation().

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type { GoogleConnection } from "../../../api/google-connections";
import type { McpConnection } from "../../../api/mcp-connections";
import type { LiveGitHubConnection } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getLiveGitHubConnection: vi.fn(),
    listLiveGoogleConnections: vi.fn(),
    listLiveMcpConnections: vi.fn(),
  };
});

import * as settingsApi from "../api";
import {
  directoryStatusFor,
  resolveIntegrationDirectoryStatuses,
} from "../settings-utils";
import {
  IntegrationLink,
  SettingsIntegrationsPage,
} from "./SettingsIntegrationPages";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("directoryStatusFor", () => {
  it("returns unconfigured when there are no records", () => {
    expect(directoryStatusFor([])).toBe("unconfigured");
  });

  it("returns connected when at least one record is connected", () => {
    expect(
      directoryStatusFor([{ status: "pending" }, { status: "connected" }]),
    ).toBe("connected");
  });

  it("returns attention when records exist but none are connected", () => {
    expect(directoryStatusFor([{ status: "pending" }])).toBe("attention");
  });
});

describe("resolveIntegrationDirectoryStatuses", () => {
  it("maps a rejected settlement to attention for every dependent status", () => {
    const rejected = {
      status: "rejected",
      reason: new Error("network down"),
    } as const;
    const result = resolveIntegrationDirectoryStatuses([
      rejected as PromiseSettledResult<LiveGitHubConnection>,
      rejected as PromiseSettledResult<GoogleConnection[]>,
      rejected as PromiseSettledResult<McpConnection[]>,
    ]);
    expect(result).toEqual({
      github: "attention",
      google: "attention",
      supabase: "attention",
      mcp: "attention",
    });
  });

  it("splits mcp connections into independent supabase and custom mcp statuses", () => {
    const result = resolveIntegrationDirectoryStatuses([
      {
        status: "fulfilled",
        value: { connected: true },
      } as PromiseSettledResult<LiveGitHubConnection>,
      {
        status: "fulfilled",
        value: [],
      } as PromiseSettledResult<GoogleConnection[]>,
      {
        status: "fulfilled",
        value: [
          { provider: "supabase", status: "connected" },
          { provider: "custom", status: "pending" },
        ],
      } as unknown as PromiseSettledResult<McpConnection[]>,
    ]);
    expect(result.supabase).toBe("connected");
    expect(result.mcp).toBe("attention");
  });
});

describe("IntegrationLink", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  it("renders the connected, attention and checking branches with matching status text", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <IntegrationLink
            to="/settings/integrations/github"
            icon={<span />}
            title="GitHub"
            description="d"
            status="connected"
          />
          <IntegrationLink
            to="/settings/integrations/google"
            icon={<span />}
            title="Google Calendar"
            description="d"
            status="attention"
          />
          <IntegrationLink
            to="/settings/integrations/mcp"
            icon={<span />}
            title="MCP plugins"
            description="d"
            status="checking"
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Needs attention");
    expect(container.textContent).toContain("Checking");

    await act(async () => root.unmount());
  });
});

describe("SettingsIntegrationsPage status resolution", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  it("shows Checking while the fetch is in flight, never a false Not configured, then resolves per card, resets on workspace change, and never leaves a stale status behind", async () => {
    const github = vi.mocked(settingsApi.getLiveGitHubConnection);
    const google = vi.mocked(settingsApi.listLiveGoogleConnections);
    const mcp = vi.mocked(settingsApi.listLiveMcpConnections);

    const firstGithub = deferred<LiveGitHubConnection>();
    const firstGoogle = deferred<GoogleConnection[]>();
    const firstMcp = deferred<McpConnection[]>();
    github.mockReturnValueOnce(firstGithub.promise);
    google.mockReturnValueOnce(firstGoogle.promise);
    mcp.mockReturnValueOnce(firstMcp.promise);

    const container = document.createElement("div");
    const root = createRoot(container);
    const statusesFor = (title: string) => {
      const card = Array.from(
        container.querySelectorAll(".settings-integration-link"),
      ).find((node) => node.textContent?.includes(title));
      return card?.querySelector(".settings-v2-status")?.textContent?.trim();
    };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SettingsIntegrationsPage workspaceId="workspace-1" />
        </MemoryRouter>,
      );
    });
    // Fetch is still pending: every card must read "Checking", never the
    // false-negative "Not configured" a connected integration would
    // otherwise flash while the request is in flight.
    expect(statusesFor("GitHub")).toBe("Checking");
    expect(statusesFor("Google Calendar")).toBe("Checking");
    expect(statusesFor("MCP plugins")).toBe("Checking");

    await act(async () => {
      firstGithub.resolve({ connected: true });
      firstGoogle.resolve([]);
      firstMcp.resolve([
        {
          id: "mcp-supabase",
          provider: "supabase",
          status: "connected",
        } as unknown as McpConnection,
        {
          id: "mcp-custom",
          provider: "custom",
          status: "pending",
        } as unknown as McpConnection,
      ]);
      await Promise.resolve();
    });
    expect(statusesFor("GitHub")).toBe("Connected");
    expect(statusesFor("Google Calendar")).toBe("Not configured");
    expect(statusesFor("Supabase")).toBe("Connected");
    expect(statusesFor("MCP plugins")).toBe("Needs attention");

    // Switching to a different workspace must not keep workspace-1's
    // "Connected" on screen while workspace-2's request is in flight.
    const secondGithub = deferred<LiveGitHubConnection>();
    github.mockReturnValueOnce(secondGithub.promise);
    google.mockReturnValueOnce(new Promise(() => undefined));
    mcp.mockReturnValueOnce(new Promise(() => undefined));
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SettingsIntegrationsPage workspaceId="workspace-2" />
        </MemoryRouter>,
      );
    });
    expect(statusesFor("GitHub")).toBe("Checking");

    // Clearing the workspace must not keep workspace-2's stale status on
    // screen either; it resolves to the accurate "no workspace" state.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SettingsIntegrationsPage workspaceId={null} />
        </MemoryRouter>,
      );
    });
    expect(statusesFor("GitHub")).toBe("Not configured");

    await act(async () => root.unmount());
  });
});
