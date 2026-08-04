import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { MendAuthContext } from "./auth.js";
import {
  createFirstWorkspace,
  createWorkspaceBootstrapAdapter,
  listBootstrapWorkspaces,
  parseBootstrapWorkspaceInput,
  WorkspaceBootstrapError,
} from "./bootstrap.js";
import type { WorkspaceWithRole } from "./workspaces.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as User;

const workspace: WorkspaceWithRole = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Mend",
  slug: "mend",
  issue_prefix: "MEND",
  next_issue_number: 1,
  timezone: "America/Sao_Paulo",
  default_language: "en",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  role: "owner",
};

const auth = {
  accessToken: "test-token",
  user,
  client: {} as MendAuthContext["client"],
};

function dependencies(options: {
  listed?: WorkspaceWithRole[];
  afterCreate?: WorkspaceWithRole[];
  created?: WorkspaceWithRole;
}) {
  let listCalls = 0;
  const list = vi.fn(async () => {
    listCalls += 1;
    return listCalls === 1
      ? (options.listed ?? [])
      : (options.afterCreate ?? []);
  });
  const create = vi.fn(async () => options.created ?? workspace);
  return { list, create };
}

describe("workspace bootstrap", () => {
  it("normalizes and validates the existing workspace input contract", () => {
    expect(
      parseBootstrapWorkspaceInput({ name: " Mend ", slug: " Mend-Desk " }),
    ).toMatchObject({
      name: "Mend",
      slug: "mend-desk",
    });
    expect(() =>
      parseBootstrapWorkspaceInput({ name: "Mend", slug: "not a slug" }),
    ).toThrow();
  });

  it("lists only the authenticated user workspaces through the adapter", async () => {
    const deps = dependencies({ listed: [workspace] });
    await expect(listBootstrapWorkspaces(auth, deps)).resolves.toEqual([
      workspace,
    ]);
    expect(deps.list).toHaveBeenCalledWith(auth);
  });

  it("rejects first-use creation when a workspace already exists without calling the RPC wrapper", async () => {
    const deps = dependencies({ listed: [workspace] });
    await expect(
      createWorkspaceBootstrapAdapter(auth, deps).createFirstWorkspace({
        name: "Other",
        slug: "other",
      }),
    ).rejects.toMatchObject({
      code: "workspace_already_exists",
    } satisfies Partial<WorkspaceBootstrapError>);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("creates through the existing workspace service and verifies owner membership after the RPC", async () => {
    const deps = dependencies({
      afterCreate: [workspace],
      created: { ...workspace, role: "owner" },
    });
    await expect(
      createFirstWorkspace(auth, { name: " Mend ", slug: " MEND " }, deps),
    ).resolves.toEqual(workspace);
    expect(deps.create).toHaveBeenCalledWith(auth, {
      name: "Mend",
      slug: "mend",
    });
    expect(deps.list).toHaveBeenCalledTimes(2);
  });

  it("rejects a created workspace whose persisted membership is not owner", async () => {
    const deps = dependencies({
      afterCreate: [{ ...workspace, role: "agent" }],
    });
    await expect(
      createWorkspaceBootstrapAdapter(auth, deps).createFirstWorkspace({
        name: "Mend",
        slug: "mend",
      }),
    ).rejects.toMatchObject({
      code: "workspace_owner_required",
    } satisfies Partial<WorkspaceBootstrapError>);
  });

  it("rejects a created workspace whose persisted slug differs from the request", async () => {
    const deps = dependencies({
      afterCreate: [{ ...workspace, slug: "other" }],
    });
    await expect(
      createWorkspaceBootstrapAdapter(auth, deps).createFirstWorkspace({
        name: "Mend",
        slug: "mend",
      }),
    ).rejects.toMatchObject({
      code: "workspace_slug_mismatch",
    } satisfies Partial<WorkspaceBootstrapError>);
  });

  it("does not accept an invalid role from the workspace listing", async () => {
    const deps = dependencies({
      listed: [
        { ...workspace, role: "superuser" as WorkspaceWithRole["role"] },
      ],
    });
    await expect(
      createWorkspaceBootstrapAdapter(auth, deps).listWorkspaces(),
    ).rejects.toMatchObject({
      code: "workspace_role_invalid",
    } satisfies Partial<WorkspaceBootstrapError>);
  });
});
