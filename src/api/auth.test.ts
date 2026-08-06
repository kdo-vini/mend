import { describe, expect, it, vi } from "vitest";
import { createWorkspace } from "./auth";
import type { MendSupabaseClient } from "../lib/supabase";

const workspace = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Mend",
  slug: "mend",
  issue_prefix: "MEND",
  next_issue_number: 1,
  timezone: "America/Sao_Paulo",
  default_language: "en",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("workspace auth helpers", () => {
  it("preserves the Supabase client context when calling rpc", async () => {
    const rpcRequest = vi.fn(
      async (_name: string, _args: Record<string, unknown>) => ({
        data: workspace,
        error: null,
      }),
    );
    const rpc = function (
      this: { rest: { rpc: typeof rpcRequest } },
      name: string,
      args: Record<string, unknown>,
    ) {
      return this.rest.rpc(name, args);
    };
    const client = {
      rest: { rpc: rpcRequest },
      rpc,
    } as unknown as MendSupabaseClient;

    await expect(
      createWorkspace({ name: " Mend ", slug: " MEND " }, client),
    ).resolves.toMatchObject({
      ...workspace,
      role: "owner",
    });
    expect(rpcRequest).toHaveBeenCalledWith("create_workspace", {
      p_name: "Mend",
      p_slug: "mend",
      p_issue_prefix: "MEND",
      p_timezone: "America/Sao_Paulo",
      p_default_language: "en-US",
    });
  });
});
