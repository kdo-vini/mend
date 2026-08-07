import { describe, expect, it, vi } from "vitest";
import {
  SupabaseCodingRunAdapter,
  type SupabaseCodexRunStore,
} from "./supabase-api-adapters.js";
import type { CodexRunRecord } from "./codex.js";
import type { CodexService } from "./codex-service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const issueId = "33333333-3333-4333-8333-333333333333";
const repositoryId = "44444444-4444-4444-8444-444444444444";

function queryResult(data: unknown) {
  return {
    data,
    error: null,
  };
}

class IssueContextClient {
  from(table: string) {
    const data =
      table === "issues"
        ? [
            {
              id: issueId,
              workspace_id: workspaceId,
              identifier: "TEC-42",
              title: "Checkout timeout",
              description: "The final checkout step times out.",
              ai_summary: "Checkout fails after payment.",
              priority: "high",
              status: "in_progress",
              conversation_id: "conversation-1",
              reproduction_steps_json: ["Open checkout", "Confirm payment"],
              expected_behavior: "Order should complete.",
              actual_behavior: "The request times out.",
              impact: "Customers cannot complete checkout.",
            },
          ]
        : table === "messages"
          ? [
              {
                direction: "inbound",
                sender_type: "contact",
                text: "Checkout hangs after payment.",
                created_at: "2026-08-03T10:00:00.000Z",
              },
            ]
          : [
              {
                direction: undefined,
                sender_type: undefined,
                body: "Operator asked engineering to investigate.",
                author_type: "user",
                created_at: "2026-08-03T10:01:00.000Z",
              },
            ];
    const state = { single: false };
    const request = {
      select: () => request,
      eq: () => request,
      order: () => request,
      limit: () => request,
      maybeSingle: () => {
        state.single = true;
        return request;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          queryResult(state.single ? (data[0] ?? null) : data),
        ).then(resolve),
    };
    return request;
  }
}

function runRecord(): CodexRunRecord {
  return {
    id: "run-1",
    workspaceId,
    issueId,
    repositoryId,
    mode: "investigate",
    status: "queued",
    progress: 0,
    result: {},
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
}

describe("live Codex route adapter", () => {
  it("starts Codex with the configured repository and issue context instead of leaving a queued row", async () => {
    let current = runRecord();
    const store = {
      createRun: vi.fn(async (input: Record<string, unknown>) => {
        current = { ...current, ...input } as CodexRunRecord;
        return current;
      }),
      getRun: vi.fn(async () => current),
      updateRun: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        current = {
          ...current,
          ...patch,
          updatedAt: "2026-08-03T10:00:01.000Z",
        } as CodexRunRecord;
        return current;
      }),
    } as unknown as SupabaseCodexRunStore;
    const start = vi.fn(async (input: Record<string, unknown>) => ({
      runId: current.id,
      run: current,
      completion: Promise.resolve({
        run: current,
        context: input.context,
        commandResults: [],
        testResults: [],
        diff: { files: [], patch: "", truncated: false },
      }),
    }));
    const codex = { start } as unknown as CodexService;
    const repositories = {
      getRepository: vi.fn(async () => ({
        id: repositoryId,
        workspaceId,
        name: "Techne",
        defaultBranch: "main",
        allowedCommands: ["test"],
      })),
    };
    const adapter = new SupabaseCodingRunAdapter(
      new IssueContextClient() as never,
      repositories,
      store,
      codex,
    );

    const result = await adapter.create(
      { userId, workspaceId, role: "agent" },
      "TEC-42",
      {
        repositoryId,
        mode: "investigate",
        branchBase: "main",
        allowChanges: false,
        commands: ["test"],
        instructions: "Check the timeout path.",
      },
    );

    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      issueId,
      repositoryId,
      issueIdentifier: "TEC-42",
      issueTitle: "Checkout timeout",
      tools: [{ kind: "command", name: "test" }],
      context: {
        issue: {
          id: issueId,
          identifier: "TEC-42",
          title: "Checkout timeout",
          priority: "high",
          status: "in_progress",
        },
        goal: "Check the timeout path.",
      },
    });
    expect(
      (
        start.mock.calls[0]?.[0] as {
          context: { conversation: { messages: Array<{ text?: string }> } };
        }
      ).context.conversation.messages,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Checkout hangs after payment." }),
        expect.objectContaining({
          text: "Operator asked engineering to investigate.",
        }),
      ]),
    );
    expect(result).toMatchObject({
      id: expect.any(String),
      status: "queued",
      result: { request: { issueIdentifier: "TEC-42", commands: ["test"] } },
    });
    expect(store.updateRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        result: expect.objectContaining({ request: expect.any(Object) }),
      }),
    );
  });

  it("requires a repository for live execution", async () => {
    const adapter = new SupabaseCodingRunAdapter(
      new IssueContextClient() as never,
      { getRepository: vi.fn() },
      {} as SupabaseCodexRunStore,
      {} as CodexService,
    );
    await expect(
      adapter.create({ userId, workspaceId, role: "agent" }, "TEC-42", {
        mode: "investigate",
        commands: [],
        allowChanges: false,
        branchBase: "main",
      }),
    ).rejects.toThrow("repository_required");
  });
});
