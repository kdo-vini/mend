import { describe, expect, it, vi } from "vitest";
import { InMemoryCodexRunStore, type RunCodexInput } from "./codex.js";
import type { CodexContext } from "./codex-service.js";
import type { CodingAgentCli } from "./coding-agent-cli.js";
import { createCodingAgentRunExecutor } from "./coding-agent-executor.js";
import {
  createResearchArtifact,
  type EffectiveRunConfig,
} from "./coding-control-plane.js";

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
  it("refines a proposal from linked research without asking for another repository pass", async () => {
    const store = new InMemoryCodexRunStore();
    const run = vi.fn(async () => ({
      provider: "openai" as const,
      version: "0.147.0",
      report: {
        verdict: "confirmed" as const,
        summary: "The proposal is ready.",
        recommendedAction: "fix" as const,
        evidence: [],
        proposal: { summary: "Add the guard", changes: ["Update route"] },
      },
      patch: { files: [], patch: "", truncated: false },
      checks: [],
      metadata: {},
    }));
    const execute = createCodingAgentRunExecutor(
      {
        getRepository: async () => ({
          agentProvider: "openai",
          executionPlane: "dokploy",
        }),
      },
      { run } as unknown as CodingAgentCli,
    );
    const researchArtifact = createResearchArtifact({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      caseId: "case-1",
      issueId: "issue-1",
      ticketRevision: "revision-1",
      baseSha: "abc123",
      diagnosis: { verdict: "confirmed", summary: "Guard is missing" },
      evidence: [],
      reproduction: { steps: ["Call the route"] },
      files: [{ path: "src/route.ts" }],
      proposal: { summary: "Add the guard", changes: ["Update route"] },
      acceptanceCriteria: ["Invalid input is rejected"],
      checks: ["test"],
      hashes: { base: "abc123" },
    });

    await execute(
      {
        ...input(store),
        mode: "propose_fix",
        stage: "research",
        caseId: "case-1",
        ticketRevision: "revision-1",
        researchArtifact,
      },
      context,
    );

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "investigate",
        stage: "research",
        prompt: expect.stringContaining("Do not research the repository again"),
      }),
    );
    expect(run.mock.calls[0]?.[0]?.prompt).toContain('"researchArtifact"');
  });

  it("selects the repository CLI and persists a normalized verdict", async () => {
    const store = new InMemoryCodexRunStore();
    const run = vi.fn(async () => ({
      provider: "anthropic" as const,
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
          agentProvider: "anthropic",
          executionPlane: "dokploy",
        }),
      },
      { run } as unknown as CodingAgentCli,
    );

    const result = await execute(input(store), context);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        mode: "investigate",
        checks: ["test"],
      }),
    );
    expect(result.run.status).toBe("completed");
    expect(result.run.result).toMatchObject({
      provider: "anthropic",
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
          agentProvider: "google",
          executionPlane: "dokploy",
        }),
      },
      {
        run: vi.fn(async () => ({
          provider: "google" as const,
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

  it("uses only an explicit fallback after a recoverable capacity error", async () => {
    const store = new InMemoryCodexRunStore();
    let calls = 0;
    const effectiveConfig: EffectiveRunConfig = {
      stage: "implement",
      connectionId: "connection-primary",
      provider: "anthropic",
      authMethod: "api_key",
      model: "claude-primary",
      budget: {
        maxRuntimeMs: 60_000,
        maxOutputTokens: 1_000,
        maxRepairs: 1,
      },
      fallbackEnabled: true,
      fallbackConnectionIds: ["connection-fallback"],
      fallbacks: [
        {
          connectionId: "connection-fallback",
          provider: "google",
          authMethod: "api_key",
          model: "gemini-fallback",
        },
      ],
      preset: "Custom",
      policySource: "override",
      resolvedAt: "2026-08-09T00:00:00.000Z",
      snapshot: {},
    };
    const run = vi.fn(async (input: { provider: string; model?: string }) => {
      calls += 1;
      if (calls === 1) throw new Error("429 rate limit exceeded");
      return {
        provider: input.provider as "google",
        version: "0.1.0",
        requestedModel: input.model,
        realModel: "gemini-2.5-pro",
        report: {
          verdict: "confirmed" as const,
          summary: "The fix is ready.",
          recommendedAction: "fix" as const,
          evidence: [],
        },
        patch: { files: [], patch: "", truncated: false },
        checks: [],
        metadata: {},
      };
    });
    const execute = createCodingAgentRunExecutor(
      {
        getRepository: async () => ({
          agentProvider: "anthropic",
          executionPlane: "dokploy",
        }),
      },
      { run } as unknown as CodingAgentCli,
      undefined,
      async (_workspaceId, connectionId) =>
        connectionId === "connection-primary"
          ? { apiKey: "primary" }
          : { apiKey: "fallback" },
    );

    const result = await execute(
      {
        ...input(store),
        mode: "implement_fix",
        stage: "implement",
        effectiveConfig,
        requestedConfig: { stage: "implement" },
      },
      context,
    );

    expect(calls).toBe(2);
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "google",
        model: "gemini-fallback",
      }),
    );
    expect(result.run).toMatchObject({
      provider: "google",
      realModel: "gemini-2.5-pro",
    });
    expect([...store.attempts.values()]).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        status: "failed",
        error_category: "capacity",
      }),
      expect.objectContaining({
        attemptNumber: 2,
        status: "completed",
        real_model: "gemini-2.5-pro",
      }),
    ]);
  });
});
