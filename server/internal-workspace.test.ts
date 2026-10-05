import { describe, expect, it, vi } from "vitest";
import {
  resolveInternalWorkspace,
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
