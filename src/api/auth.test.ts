import { describe, expect, it, vi } from "vitest";
import {
  acceptInvitationAndSetPassword,
  createWorkspace,
  signInWithGoogle,
  signUpWithPassword,
} from "./auth";
import type { MendSupabaseClient } from "../lib/supabase";

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

  it("does not change the password when the invitation is rejected", async () => {
    const updateUser = vi.fn(async () => ({ data: {}, error: null }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "workspace_invitation_email_mismatch" },
    }));
    const client = {
      auth: { updateUser },
      rpc,
    } as unknown as MendSupabaseClient;

    await expect(
      acceptInvitationAndSetPassword("invite-1", "new-password-1", client),
    ).rejects.toThrow();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("accepts the invitation before setting the password", async () => {
    const order: string[] = [];
    const updateUser = vi.fn(async () => {
      order.push("password");
      return { data: {}, error: null };
    });
    const rpc = vi.fn(async () => {
      order.push("accept");
      return { data: { id: "member-1" }, error: null };
    });
    const client = {
      auth: { updateUser },
      rpc,
    } as unknown as MendSupabaseClient;

    await acceptInvitationAndSetPassword("invite-1", "new-password-1", client);
    expect(order).toEqual(["accept", "password"]);
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

  it("rejects workspace creation without making any database call", async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as MendSupabaseClient;
    await expect(
      createWorkspace({ name: "Mend", slug: "mend" }, client),
    ).rejects.toThrow("workspace_creation_disabled");
    expect(rpc).not.toHaveBeenCalled();
  });
});
