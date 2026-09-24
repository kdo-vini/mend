import { describe, expect, it } from "vitest";
import type { MendSupabaseClient } from "../lib/supabase";
import { DEFAULT_WORKSPACE_AI_POLICY } from "../ai-policy";
import {
  preferredConversationAiMode,
  saveLiveConversationAiPolicy,
  saveLiveWorkspaceAiPolicy,
} from "./settings-actions";

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
        automation_fallback_route: "safe_auto_reply",
      }),
    });
  });

  it("prefers majority mode and breaks mixed ties toward safe_auto", () => {
    expect(
      preferredConversationAiMode(
        { off: 0, draft: 2, safe_auto: 5 },
        "safe_auto",
      ),
    ).toBe("safe_auto");
    expect(
      preferredConversationAiMode({ off: 1, draft: 3, safe_auto: 2 }, "mixed"),
    ).toBe("draft");
    expect(
      preferredConversationAiMode({ off: 1, draft: 2, safe_auto: 2 }, "mixed"),
    ).toBe("safe_auto");
  });

  it("resumes paused conversations when enabling safe_auto workspace-wide", async () => {
    const rpcCalls: Array<Record<string, string>> = [];
    const conversationsQuery = {
      update() {
        return conversationsQuery;
      },
      eq() {
        return conversationsQuery;
      },
      select() {
        return Promise.resolve({
          data: [{ id: "c1" }, { id: "c2" }],
          error: null,
        });
      },
    };
    const stateQuery = {
      select() {
        return stateQuery;
      },
      eq() {
        return stateQuery;
      },
      then(
        resolve: (value: {
          data: Array<{ conversation_id: string }>;
          error: null;
        }) => unknown,
      ) {
        return Promise.resolve(
          resolve({
            data: [{ conversation_id: "c1" }, { conversation_id: "c2" }],
            error: null,
          }),
        );
      },
    };
    const client = {
      from(table: string) {
        if (table === "conversations") return conversationsQuery;
        if (table === "conversation_ai_state") return stateQuery;
        throw new Error(`unexpected table ${table}`);
      },
      rpc(name: string, args: Record<string, string>) {
        expect(name).toBe("resume_conversation_ai");
        rpcCalls.push(args);
        return Promise.resolve({ data: null, error: null });
      },
    } as unknown as MendSupabaseClient;

    const result = await saveLiveConversationAiPolicy(
      "workspace-1",
      "safe_auto",
      client,
    );

    expect(result.updatedCount).toBe(2);
    expect(result.resumedCount).toBe(2);
    expect(rpcCalls).toEqual([
      { p_workspace_id: "workspace-1", p_conversation_id: "c1" },
      { p_workspace_id: "workspace-1", p_conversation_id: "c2" },
    ]);
  });
});
