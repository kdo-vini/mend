import { describe, expect, it } from "vitest";
import {
  contentAddressHash,
  createResearchArtifact,
  isRecoverableFallbackError,
  isResearchArtifactCurrent,
  normalizeAgentUsage,
  resolveEffectiveRunConfig,
  type AgentConnection,
  type CatalogSnapshot,
} from "./coding-control-plane.js";

const connection = (
  overrides: Partial<AgentConnection> = {},
): AgentConnection => ({
  id: "connection-a",
  workspaceId: "workspace-1",
  label: "OpenAI subscription",
  provider: "openai",
  authMethod: "subscription",
  purpose: "coding",
  status: "connected",
  automationConsent: true,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
  ...overrides,
});

const catalog = (connectionId = "connection-a"): CatalogSnapshot => ({
  connectionId,
  provider: "openai",
  cliVersion: "codex-cli 0.147.0",
  models: [{ id: "gpt-5-codex", efforts: ["low", "high"] }],
  source: "cli",
  lastVerifiedAt: "2026-08-09T00:00:00.000Z",
  expiresAt: "2026-08-10T00:00:00.000Z",
});

describe("coding control plane", () => {
  it("resolves override before repository and workspace policy", () => {
    const result = resolveEffectiveRunConfig({
      stage: "implement",
      workspacePolicy: {
        stage: "implement",
        connectionId: "connection-a",
        model: "gpt-5-codex",
        preset: "Economy",
      },
      repositoryPolicy: {
        stage: "implement",
        connectionId: "connection-a",
        model: "gpt-5-codex",
        effort: "low",
        preset: "Balanced",
      },
      override: {
        stage: "implement",
        connectionId: "connection-a",
        model: "gpt-5-codex",
        effort: "high",
        preset: "Custom",
      },
      connections: { "connection-a": connection() },
      catalogs: { "connection-a": catalog() },
      automation: true,
    });
    expect(result.policySource).toBe("override");
    expect(result.effort).toBe("high");
    expect(result.preset).toBe("Custom");
  });

  it("blocks an unverified catalog and subscription automation without consent", () => {
    expect(() =>
      resolveEffectiveRunConfig({
        stage: "research",
        workspacePolicy: {
          stage: "research",
          connectionId: "connection-a",
          model: "gpt-5-codex",
          preset: "Balanced",
        },
        connections: {
          "connection-a": connection({ automationConsent: false }),
        },
        catalogs: { "connection-a": catalog() },
        automation: true,
      }),
    ).toThrow("agent_subscription_automation_not_consented");
    expect(() =>
      resolveEffectiveRunConfig({
        stage: "research",
        workspacePolicy: {
          stage: "research",
          connectionId: "connection-a",
          model: "gpt-5-codex",
          preset: "Balanced",
        },
        connections: { "connection-a": connection() },
        catalogs: {},
        automation: false,
      }),
    ).toThrow("agent_catalog_unverified");
  });

  it("content-addresses an artifact and invalidates it by revision or SHA", () => {
    const artifact = createResearchArtifact({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      caseId: "case-1",
      issueId: "issue-1",
      ticketRevision: "issue-updated-1",
      baseSha: "abc123",
      diagnosis: { verdict: "confirmed", summary: "Bug confirmed" },
      evidence: [],
      reproduction: { steps: [] },
      files: [],
      proposal: { summary: "Fix it", changes: [] },
      acceptanceCriteria: [],
      checks: [],
      hashes: { base: "abc123" },
    });
    expect(artifact.contentHash).toHaveLength(64);
    expect(
      isResearchArtifactCurrent(artifact, "issue-updated-1", "abc123"),
    ).toBe(true);
    expect(
      isResearchArtifactCurrent(artifact, "issue-updated-2", "abc123"),
    ).toBe(false);
    expect(contentAddressHash({ b: 1, a: 2 })).toBe(
      contentAddressHash({ a: 2, b: 1 }),
    );
  });

  it("only allows recoverable capacity failures to use fallback", () => {
    expect(isRecoverableFallbackError(new Error("rate limit exceeded"))).toBe(
      true,
    );
    expect(
      isRecoverableFallbackError(new Error("invalid authentication")),
    ).toBe(false);
    expect(
      isRecoverableFallbackError(new Error("schema validation failed")),
    ).toBe(false);
  });

  it("normalizes subscription usage without recording a fake zero cost", () => {
    expect(
      normalizeAgentUsage(
        { input_tokens: 10, output_tokens: 5 },
        "subscription",
      ),
    ).toMatchObject({
      totalTokens: 15,
      cost: { method: "included_in_subscription" },
    });
  });
});
