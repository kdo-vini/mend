import { describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("./transport", () => ({ apiRequest }));

import { createLiveMcpConnection } from "./mcp-connections";

describe("MCP connection API", () => {
  it("sends the explicit Supabase project and capability scope", async () => {
    apiRequest.mockResolvedValueOnce({ connection: { id: "connection-1" } });
    const input: Parameters<typeof createLiveMcpConnection>[1] = {
      name: "Supabase abcdefghijklmnopqrst",
      serverUrl: "https://mcp.supabase.com/mcp",
      authMode: "oauth",
      provider: "supabase",
      supabase: {
        projectRef: "abcdefghijklmnopqrst",
        readOnly: true,
        features: ["database", "debugging"],
      },
    };

    await createLiveMcpConnection("workspace-1", input);

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/mcp/connections",
      { method: "POST", body: JSON.stringify(input) },
      "workspace-1",
    );
  });
});
