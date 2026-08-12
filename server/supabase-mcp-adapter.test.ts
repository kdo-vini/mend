import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptMcpSecret } from "./mcp.js";
import { SupabaseMcpConnectionAdapter } from "./supabase-api-adapters.js";

describe("SupabaseMcpConnectionAdapter runtime connections", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the decrypted OAuth bearer token to the server-side worker", async () => {
    vi.stubEnv("CONNECTION_ENCRYPTION_KEY", "test-runtime-key");
    const connection = {
      id: "connection-1",
      workspace_id: "workspace-1",
      name: "Supabase project",
      description: "Support database",
      server_url:
        "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&read_only=true&features=database",
      auth_mode: "oauth",
      status: "connected",
      tools_json: [
        {
          name: "list_tables",
          annotations: { readOnlyHint: true },
        },
      ],
      allowed_tool_names_json: ["list_tables"],
      write_modes_json: [],
      last_error: null,
      last_tested_at: "2026-08-11T00:00:00.000Z",
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z",
    };
    const client = {
      from(table: string) {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          order() {
            return Promise.resolve({ data: [connection], error: null });
          },
          maybeSingle() {
            if (table !== "mcp_connection_secrets")
              return Promise.resolve({ data: null, error: null });
            return Promise.resolve({
              data: {
                access_token_encrypted: encryptMcpSecret(
                  "oauth-access-token",
                  "test-runtime-key",
                ),
                refresh_token_encrypted: null,
                token_expires_at: "2099-01-01T00:00:00.000Z",
              },
              error: null,
            });
          },
        };
        return query;
      },
    };

    const result = await new SupabaseMcpConnectionAdapter(
      client as never,
      client as never,
    ).runtimeList({ workspaceId: "workspace-1" });

    expect(result).toHaveLength(1);
    expect(result[0]?.headers).toEqual({
      Authorization: "Bearer oauth-access-token",
    });
    expect(result[0]?.supabaseScope?.projectRef).toBe("abcdefghijklmnopqrst");
  });
});
