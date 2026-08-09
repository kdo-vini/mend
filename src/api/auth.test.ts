import { describe, expect, it, vi } from "vitest";
import { createWorkspace, signInWithGoogle, signUpWithPassword } from "./auth";
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
  it("sends confirmed signups back to the explicit sign-in route", async () => {
    const signUp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));
    const client = {
      auth: { signUp },
    } as unknown as MendSupabaseClient;

    await expect(
      signUpWithPassword(
        " owner@example.com ",
        "password-123",
        "https://mend.test/?auth=1",
        client,
      ),
    ).resolves.toMatchObject({ data: { session: null } });
    expect(signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "password-123",
      options: { emailRedirectTo: "https://mend.test/?auth=1" },
    });
  });

  it("starts Google OAuth with the app redirect URL", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: { provider: "google", url: "https://accounts.google.com" },
      error: null,
    }));
    const client = {
      auth: { signInWithOAuth },
    } as unknown as MendSupabaseClient;

    await expect(
      signInWithGoogle("https://mend.test", client),
    ).resolves.toMatchObject({ data: { provider: "google" } });
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://mend.test" },
    });
  });

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
      p_default_language: "pt-BR",
    });
  });
});
