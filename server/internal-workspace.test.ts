import { describe, expect, it, vi } from "vitest";
import {
  resolveInternalWorkspace,
  SupabaseInternalWorkspaceAdapter,
  internalWorkspaceSession,
} from "./internal-workspace.js";

describe("internal workspace boundary", () => {
  it("uses the canonical UUID for legacy clients that omit a workspace", async () => {
    await expect(
      resolveInternalWorkspace({ resolve: async () => "canonical" }),
    ).resolves.toBe("canonical");
  });
  it("keeps callers sending the existing bridge UUID compatible", async () => {
    await expect(
      resolveInternalWorkspace(
        { resolve: async () => "canonical" },
        "canonical",
      ),
    ).resolves.toBe("canonical");
  });
  it("rejects client-selected legacy workspace IDs", async () => {
    await expect(
      resolveInternalWorkspace({ resolve: async () => "canonical" }, "legacy"),
    ).rejects.toMatchObject({ code: "workspace_not_found" });
  });
  it("fails closed instead of selecting a default workspace", async () => {
    await expect(
      resolveInternalWorkspace({ resolve: async () => null }),
    ).rejects.toMatchObject({ code: "internal_workspace_unconfigured" });
  });
  it("does not suppress database resolution failures", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    await expect(resolveInternalWorkspace({ resolve })).rejects.toThrow(
      "database unavailable",
    );
  });
  it.each(["owner", "admin", "agent", "viewer"] as const)(
    "keeps %s access management separate from membership",
    (role) => {
      expect(
        internalWorkspaceSession({
          userId: "user",
          workspaceId: "canonical",
          role,
        }),
      ).toEqual({
        workspaceId: "canonical",
        role,
        canManageAccess: ["owner", "admin"].includes(role),
      });
    },
  );
});

describe("SupabaseInternalWorkspaceAdapter cache", () => {
  const client = (results: Array<{ data: unknown; error: unknown }>) => {
    const maybeSingle = vi.fn(
      async () => results.shift() ?? { data: null, error: null },
    );
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    return {
      client: { from: vi.fn(() => ({ select })) } as never,
      maybeSingle,
    };
  };

  it("resolves once, then serves the id from memory until the TTL passes", async () => {
    let now = 0;
    const { client: fake, maybeSingle } = client([
      { data: { workspace_id: "ws" }, error: null },
      { data: { workspace_id: "ws" }, error: null },
    ]);
    const adapter = new SupabaseInternalWorkspaceAdapter(fake, 1000, () => now);
    expect(await adapter.resolve()).toBe("ws");
    expect(await adapter.resolve()).toBe("ws");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    now = 1001;
    expect(await adapter.resolve()).toBe("ws");
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures or a missing workspace", async () => {
    const { client: fake, maybeSingle } = client([
      { data: null, error: { message: "down" } },
      { data: null, error: null },
      { data: { workspace_id: "ws" }, error: null },
    ]);
    const adapter = new SupabaseInternalWorkspaceAdapter(fake);
    await expect(adapter.resolve()).rejects.toMatchObject({
      code: "internal_workspace_unconfigured",
    });
    expect(await adapter.resolve()).toBeNull();
    expect(await adapter.resolve()).toBe("ws");
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });
});
