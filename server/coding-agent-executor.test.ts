import { describe, expect, it, vi } from "vitest";
import { InMemoryCodexRunStore, type RunCodexInput } from "./codex.js";
import type { CodexContext } from "./codex-service.js";
import type { CodingAgentCli } from "./coding-agent-cli.js";
import { createCodingAgentRunExecutor } from "./coding-agent-executor.js";

const context: CodexContext = {
  issue: { id: "issue-1", identifier: "MEND-1", title: "Checkout fails" },
  repository: { id: "repo-1", name: "Product", defaultBranch: "main" },
};

function input(store: InMemoryCodexRunStore): RunCodexInput {
  return {
    workspaceId: "workspace-1",
    issueId: "issue-1",
    repositoryId: "repo-1",
    issueIdentifier: "MEND-1",
    issueTitle: "Checkout fails",
    mode: "investigate",
    repoRoot: "C:/workspace/product",
    tools: [{ kind: "command", name: "test" }],
    store,
  };
}

describe("coding agent run executor", () => {
  it("selects the repository CLI and persists a normalized verdict", async () => {
    const store = new InMemoryCodexRunStore();
    const run = vi.fn(async () => ({
      provider: "claude" as const,
      version: "2.1.220",
      report: {
        verdict: "confirmed" as const,
        summary: "The null input reproduces.",
        rootCause: "The route misses a guard.",
        recommendedAction: "fix" as const,
        evidence: [
          {
            kind: "test" as const,
            label: "Regression test fails before the guard",
          },
        ],
      },
      patch: { files: [], patch: "", truncated: false },
      checks: [
        {
          name: "test" as const,
          exitCode: 0,
          output: "passed",
          passed: true,
        },
      ],
      metadata: { num_turns: 2 },
    }));
    const execute = createCodingAgentRunExecutor(
      {
        getRepository: async () => ({
          agentProvider: "claude",
          executionPlane: "local_cli",
        }),
      },
      { run } as unknown as CodingAgentCli,
    );

    const result = await execute(input(store), context);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        mode: "investigate",
        checks: ["test"],
      }),
    );
    expect(result.run.status).toBe("completed");
    expect(result.run.result).toMatchObject({
      provider: "claude",
      agent: { report: { verdict: "confirmed" } },
      checks: [{ name: "test", exitCode: 0 }],
    });
    expect(result.run.branchName).toMatch(
      /^ops\/mend-1-checkout-fails-[a-f0-9-]+$/,
    );
  });

  it("fails a read-only run if a provider changes files", async () => {
    const store = new InMemoryCodexRunStore();
    const execute = createCodingAgentRunExecutor(
      {
        getRepository: async () => ({
          agentProvider: "gemini",
          executionPlane: "local_cli",
        }),
      },
      {
        run: vi.fn(async () => ({
          provider: "gemini" as const,
          version: "0.49.0",
          report: {
            verdict: "confirmed" as const,
            summary: "Changed a file unexpectedly.",
            recommendedAction: "fix" as const,
            evidence: [],
          },
          patch: {
            files: [
              {
                relativePath: "src/index.ts",
                status: "modified" as const,
                oldSize: 1,
                newSize: 2,
              },
            ],
            patch: "diff",
            truncated: false,
          },
          checks: [],
          metadata: {},
        })),
      } as unknown as CodingAgentCli,
    );

    await expect(execute(input(store), context)).rejects.toThrow(
      "Read-only coding agent changed",
    );
    expect([...store.runs.values()][0]?.status).toBe("failed");
  });
});
