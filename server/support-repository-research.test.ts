import { describe, expect, it } from "vitest";
import {
  createSupportResearchArtifact,
  deepResearchMayAutoSend,
  mayQueueSupportResearch,
  researchArtifactEvidence,
  supportResearchDedupeKey,
  supportResearchRevisionSetHash,
  SupportRepositoryResearchProcessor,
} from "./support-repository-research.js";

const repository = {
  repositoryId: "10000000-0000-4000-8000-000000000001",
  activeSha: "a".repeat(40),
};

describe("support repository research", () => {
  it("runs only for insufficient draft-mode requests with exact active revisions", () => {
    expect(
      mayQueueSupportResearch({
        retrievalSufficient: false,
        productAmbiguous: false,
        aiMode: "draft",
        repositories: [repository],
      }),
    ).toBe(true);
    expect(
      mayQueueSupportResearch({
        retrievalSufficient: false,
        productAmbiguous: false,
        aiMode: "auto_safe",
        repositories: [repository],
      }),
    ).toBe(false);
  });

  it("is content-addressed and rejects facts without exact file-line evidence", () => {
    const base = {
      workspaceId: "10000000-0000-4000-8000-000000000002",
      conversationId: "10000000-0000-4000-8000-000000000003",
      messageId: "10000000-0000-4000-8000-000000000004",
      productIds: ["10000000-0000-4000-8000-000000000005"],
      repositories: [repository],
      facts: [
        {
          statement: "O caixa precisa estar aberto antes de registrar a venda.",
          ...repository,
          relativePath: "src/checkout.ts",
          lineStart: 12,
          lineEnd: 18,
        },
      ],
      confidence: 0.9,
    };
    const artifact = createSupportResearchArtifact(base);
    expect(createSupportResearchArtifact(base).contentHash).toBe(
      artifact.contentHash,
    );
    expect(researchArtifactEvidence(artifact)[0]).toMatchObject({
      sourceKind: "repository_research",
      sourceRevision: repository.activeSha,
      trustLevel: "generated",
      audience: "internal",
    });
    expect(() =>
      createSupportResearchArtifact({
        ...base,
        facts: [{ ...base.facts[0], relativePath: "../.env" }],
      }),
    ).toThrow("support_research_evidence_required");
  });

  it("deduplicates by message and revision set and blocks auto-send by default", () => {
    const revisionSetHash = supportResearchRevisionSetHash([repository]);
    expect(
      supportResearchDedupeKey({
        workspaceId: "10000000-0000-4000-8000-000000000002",
        messageId: "10000000-0000-4000-8000-000000000004",
        revisionSetHash,
      }),
    ).toContain(revisionSetHash);
    expect(deepResearchMayAutoSend({})).toBe(false);
    expect(
      deepResearchMayAutoSend({
        deepResearchAutoSendEnabled: true,
        latestEvaluationEligible: true,
      }),
    ).toBe(true);
  });

  it("reuses an artifact and gives the agent a closed read-only budget", async () => {
    const revisionSetHash = supportResearchRevisionSetHash([repository]);
    const payload = {
      stage: "support_repository_research" as const,
      workspaceId: "10000000-0000-4000-8000-000000000002",
      conversationId: "10000000-0000-4000-8000-000000000003",
      messageId: "10000000-0000-4000-8000-000000000004",
      productIds: ["10000000-0000-4000-8000-000000000005"],
      repositories: [repository],
      revisionSetHash,
    };
    let saved: ReturnType<typeof createSupportResearchArtifact> | null = null;
    const agent = {
      research: async (input: {
        allowNetwork: false;
        allowWrites: false;
        allowCommands: false;
        maxFileReads: number;
        maxCharacters: number;
      }) => {
        expect(input).toMatchObject({
          allowNetwork: false,
          allowWrites: false,
          allowCommands: false,
          maxFileReads: 200,
          maxCharacters: 120_000,
        });
        return {
          facts: [
            {
              statement: "Configuração confirmada.",
              ...repository,
              relativePath: "docs/config.md",
              lineStart: 2,
              lineEnd: 3,
            },
          ],
          confidence: 0.8,
        };
      },
    };
    const processor = new SupportRepositoryResearchProcessor(agent, {
      find: async () => saved,
      save: async (artifact) => {
        saved = artifact;
      },
    });
    const first = await processor.process(payload);
    const second = await processor.process(payload);
    expect(second.contentHash).toBe(first.contentHash);
  });
});
