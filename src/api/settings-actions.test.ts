import { describe, expect, it } from "vitest";
import type { MendSupabaseClient } from "../lib/supabase";
import { DEFAULT_WORKSPACE_AI_POLICY } from "../ai-policy";
import { saveLiveWorkspaceAiPolicy } from "./settings-actions";

describe("workspace AI policy persistence", () => {
  it("updates the workspace once and lets the database trigger write the audit row", async () => {
    const calls: string[] = [];
    let updatePayload: Record<string, unknown> | undefined;
    const query = {
      update(value: Record<string, unknown>) {
        updatePayload = value;
        return query;
      },
      eq() {
        return query;
      },
      select() {
        return Promise.resolve({
          data: [{ id: "workspace-1" }],
          error: null,
        });
      },
    };
    const client = {
      from(table: string) {
        calls.push(table);
        if (table === "audit_log")
          throw new Error("audit_log must be written by the database trigger");
        return query;
      },
    } as unknown as MendSupabaseClient;

    const result = await saveLiveWorkspaceAiPolicy(
      "workspace-1",
      DEFAULT_WORKSPACE_AI_POLICY,
      client,
    );

    expect(result.updatedCount).toBe(1);
    expect(calls).toEqual(["workspaces"]);
    expect(updatePayload).toMatchObject({
      ai_policy_json: expect.objectContaining({
        automation_fallback_route: "draft_for_review",
      }),
    });
  });
});
