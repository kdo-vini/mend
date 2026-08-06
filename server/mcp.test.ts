import { describe, expect, it } from "vitest";
import {
  connectionEncryptionKey,
  decryptMcpSecret,
  encryptMcpSecret,
  mcpArgumentsHmac,
  mcpToolRecord,
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
});
