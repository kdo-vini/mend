import { describe, expect, it } from "vitest";
import {
  buildSupabaseMcpServerUrl,
  connectionEncryptionKey,
  decryptMcpSecret,
  encryptMcpSecret,
  mcpArgumentsHmac,
  mcpToolRecord,
  parseSupabaseMcpServerUrl,
  resolvePublicNetworkTarget,
  safeExternalFetch,
  validateMcpHeaders,
  validateMcpServerUrl,
} from "./mcp.js";

describe("MCP connection security helpers", () => {
  it("encrypts secrets and does not expose plaintext", () => {
    const encrypted = encryptMcpSecret("Bearer secret", "test-key");
    expect(encrypted).not.toContain("Bearer secret");
    expect(decryptMcpSecret(encrypted, "test-key")).toBe("Bearer secret");
    expect(
      connectionEncryptionKey({ CONNECTION_ENCRYPTION_KEY: "test-key" }),
    ).toBe("test-key");
  });

  it("rejects unsafe headers and private production destinations", () => {
    expect(() => validateMcpHeaders({ Cookie: "session" })).toThrow();
    expect(() =>
      validateMcpServerUrl("http://localhost:3000/mcp", {
        NODE_ENV: "production",
      }),
    ).toThrow();
    expect(() =>
      validateMcpServerUrl("https://10.0.0.5/mcp", { NODE_ENV: "production" }),
    ).toThrow();
    expect(
      validateMcpServerUrl("http://localhost:3000/mcp", {
        NODE_ENV: "development",
      }),
    ).toContain("localhost");
  });

  it("classifies only explicit readOnlyHint tools as reads", () => {
    expect(
      mcpToolRecord({
        name: "buscar_cliente",
        annotations: { readOnlyHint: true },
      })?.readOnly,
    ).toBe(true);
    expect(mcpToolRecord({ name: "executar_sql" })?.readOnly).toBe(false);
    expect(mcpArgumentsHmac('{"phone":"5511"}', "test-key")).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("builds a project-scoped Supabase MCP URL from an explicit allowlist", () => {
    const url = buildSupabaseMcpServerUrl({
      projectRef: "abcdefghijklmnopqrst",
      readOnly: true,
      features: ["database", "debugging", "docs"],
    });

    expect(url).toContain("https://mcp.supabase.com/mcp?");
    expect(parseSupabaseMcpServerUrl(url)).toEqual({
      projectRef: "abcdefghijklmnopqrst",
      readOnly: true,
      features: ["database", "debugging", "docs"],
    });
    expect(url).not.toContain("account");
    expect(
      parseSupabaseMcpServerUrl(
        "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&features=database,account",
      ),
    ).toBeNull();
    expect(
      parseSupabaseMcpServerUrl(
        "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&features=database&account=true",
      ),
    ).toBeNull();
    expect(
      parseSupabaseMcpServerUrl(
        "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&features=database&features=docs",
      ),
    ).toBeNull();
  });

  it("rejects unscoped or unsupported Supabase MCP capabilities", () => {
    expect(() =>
      buildSupabaseMcpServerUrl({
        projectRef: "bad ref",
        readOnly: true,
        features: ["database"],
      }),
    ).toThrow("project ref");
    expect(() =>
      buildSupabaseMcpServerUrl({
        projectRef: "abcdefghijklmnopqrst",
        readOnly: false,
        features: [] as never[],
      }),
    ).toThrow("feature group");
  });

  it("rejects hostnames whose DNS records resolve to private networks", async () => {
    const lookup = async () => [
      { address: "127.0.0.1", family: 4 as const },
      { address: "::1", family: 6 as const },
    ];

    await expect(
      resolvePublicNetworkTarget("https://mcp.example.test/tools", lookup),
    ).rejects.toMatchObject({ code: "mcp_server_url_private" });
  });

  it("bounds DNS resolution time", async () => {
    await expect(
      resolvePublicNetworkTarget(
        "https://mcp.example.test/tools",
        () => new Promise(() => undefined),
        5,
      ),
    ).rejects.toMatchObject({ code: "mcp_dns_timeout", status: 504 });
  });

  it("revalidates redirect targets and refuses redirects into private networks", async () => {
    const fetchImpl = async (url: string | URL) =>
      new Response(null, {
        status: String(url).includes("public.example") ? 302 : 200,
        headers: String(url).includes("public.example")
          ? { location: "https://internal.example/admin" }
          : {},
      });
    const lookup = async (hostname: string) => [
      {
        address:
          hostname === "internal.example" ? "169.254.169.254" : "93.184.216.34",
        family: 4 as const,
      },
    ];

    await expect(
      safeExternalFetch("https://public.example/mcp", {
        fetchImpl,
        lookup,
      }),
    ).rejects.toMatchObject({ code: "mcp_server_url_private" });
  });
});
