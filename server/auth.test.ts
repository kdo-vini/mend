import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  authenticateBearer,
  AuthenticationError,
  parseBearerToken,
} from "./auth.js";
import {
  addWorkspaceMember,
  createWorkspace,
  requireWorkspaceRole,
} from "./workspaces.js";
import type { MendAuthContext } from "./auth.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as User;

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

function fakeClient(options: {
  role?: string;
  rpc?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}) {
  const membershipQuery = {
    select: () => membershipQuery,
    eq: () => membershipQuery,
    maybeSingle: () =>
      Promise.resolve({
        data: options.role ? { role: options.role } : null,
        error: null,
      }),
  };
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => membershipQuery),
    rpc: options.rpc ?? vi.fn(),
  } as unknown as MendAuthContext["client"];
}

function authFor(client: MendAuthContext["client"]): MendAuthContext {
  return { accessToken: "test-token", user, client };
}

describe("bearer authentication", () => {
  it("parses only a well-formed bearer header", () => {
    expect(parseBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(parseBearerToken("bearer token")).toBe("token");
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("rejects a missing bearer without invoking Supabase", async () => {
    const factory = vi.fn(() => fakeClient({}));
    await expect(
      authenticateBearer({ authorization: undefined, clientFactory: factory }),
    ).rejects.toMatchObject({
      code: "missing_bearer",
      statusCode: 401,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses the injected fake verifier and returns an authenticated context", async () => {
    const client = fakeClient({});
    const verifyUser = vi.fn(async (_client, token) =>
      token === "valid-token" ? user : null,
    );
    const context = await authenticateBearer({
      authorization: "Bearer valid-token",
      clientFactory: () => client,
      verifyUser,
    });
    expect(context.user.id).toBe(user.id);
    expect(context.accessToken).toBe("valid-token");
    expect(verifyUser).toHaveBeenCalledWith(client, "valid-token");
  });

  it("normalizes verifier failures to an invalid bearer error", async () => {
    await expect(
      authenticateBearer({
        authorization: "Bearer expired-token",
        clientFactory: () => fakeClient({}),
        verifyUser: async () => null,
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("workspace authorization helpers", () => {
  it("resolves the role from a membership query before allowing an action", async () => {
    const client = fakeClient({ role: "agent" });
    await expect(
      requireWorkspaceRole(authFor(client), workspace.id, [
        "agent",
        "admin",
        "owner",
      ]),
    ).resolves.toBe("agent");
    await expect(
      requireWorkspaceRole(authFor(client), workspace.id, ["viewer"]),
    ).rejects.toMatchObject({
      code: "workspace_role_denied",
      statusCode: 403,
    });
  });

  it("calls the typed workspace RPC with the verified workspace context", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = fakeClient({
      role: "owner",
      rpc: async (name, args) => {
        calls.push({ name, args });
        return {
          data: {
            ...workspace,
            user_id: user.id,
            role: "agent",
            created_at: workspace.created_at,
          },
          error: null,
        };
      },
    });
    const member = await addWorkspaceMember(
      authFor(client),
      workspace.id,
      "33333333-3333-4333-8333-333333333333",
    );
    expect(member.role).toBe("agent");
    expect(calls).toEqual([
      {
        name: "add_workspace_member",
        args: {
          p_workspace_id: workspace.id,
          p_user_id: "33333333-3333-4333-8333-333333333333",
          p_role: "agent",
        },
      },
    ]);
  });

  it("creates a workspace through the server-side RPC contract", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = fakeClient({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: workspace, error: null };
      },
    });
    const created = await createWorkspace(authFor(client), {
      name: "Mend",
      slug: "mend",
    });
    expect(created.role).toBe("owner");
    expect(calls[0]).toEqual({
      name: "create_workspace",
      args: {
        p_name: "Mend",
        p_slug: "mend",
        p_issue_prefix: "MEND",
        p_timezone: "America/Sao_Paulo",
        p_default_language: "en",
      },
    });
  });
});
