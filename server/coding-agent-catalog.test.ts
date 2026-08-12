import { afterEach, describe, expect, it, vi } from "vitest";
import { stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentConnection } from "./coding-control-plane.js";
import {
  DefaultCodingCatalogProvider,
  prepareCodingCatalogHome,
} from "./coding-agent-catalog.js";

const connection: AgentConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  label: "OpenAI API key",
  provider: "openai",
  authMethod: "api_key",
  purpose: "coding",
  status: "connected",
  automationConsent: false,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("coding agent catalog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies OpenAI API keys through the Models API without requiring the CLI", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.3-codex" },
              { id: "gpt-4.1" },
              { id: "text-embedding-3-small" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);

    const catalog = await new DefaultCodingCatalogProvider().list(connection, {
      apiKey: "workspace-openai-key",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer workspace-openai-key" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(catalog).toMatchObject({
      connectionId: connection.id,
      provider: "openai",
      source: "api",
      models: [{ id: "gpt-5.3-codex" }, { id: "gpt-4.1" }],
    });
  });

  it("prepares subscription catalog state outside the system temp directory", async () => {
    const homeDirectory = await prepareCodingCatalogHome();
    try {
      expect(path.relative(os.tmpdir(), homeDirectory).startsWith("..")).toBe(
        true,
      );
      expect(
        (await stat(path.join(homeDirectory, ".codex"))).isDirectory(),
      ).toBe(true);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it("rejects a successful catalog response without coding-capable models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ id: "whisper-1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(
      new DefaultCodingCatalogProvider().list(connection, {
        apiKey: "workspace-openai-key",
      }),
    ).rejects.toThrow("agent_catalog_empty");
  });
});
