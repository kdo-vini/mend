import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupportKnowledgeEvidence } from "./support-evidence.js";
import { SUPPORT_REPOSITORY_RESEARCH_JOB_TYPE } from "./workers/live-worker-shared.js";
import type { KnowledgeMetricWriter } from "./knowledge-evals.js";

export { SUPPORT_REPOSITORY_RESEARCH_JOB_TYPE };
export const MAX_RESEARCH_REPOSITORIES = 5;
export const MAX_RESEARCH_FILE_READS = 200;
export const MAX_RESEARCH_CHARACTERS = 120_000;

const repositorySchema = z
  .object({
    repositoryId: z.string().uuid(),
    activeSha: z.string().regex(/^[a-f0-9]{40,64}$/),
  })
  .strict();

export const supportRepositoryResearchJobPayloadSchema = z
  .object({
    stage: z.literal("support_repository_research"),
    workspaceId: z.string().uuid(),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    productIds: z.array(z.string().uuid()).min(1).max(20),
    repositories: z
      .array(repositorySchema)
      .min(1)
      .max(MAX_RESEARCH_REPOSITORIES),
    revisionSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type SupportRepositoryResearchJobPayload = z.infer<
  typeof supportRepositoryResearchJobPayloadSchema
>;

export interface SupportRepositoryResearchFact {
  statement: string;
  repositoryId: string;
  activeSha: string;
  relativePath: string;
  lineStart: number;
  lineEnd: number;
}

export interface SupportRepositoryResearchArtifact {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  productIds: readonly string[];
  repositories: readonly { repositoryId: string; activeSha: string }[];
  facts: readonly SupportRepositoryResearchFact[];
  confidence: number;
  contentHash: string;
}

export function supportResearchRevisionSetHash(
  repositories: readonly { repositoryId: string; activeSha: string }[],
) {
  return createHash("sha256")
    .update(
      [...repositories]
        .sort((left, right) =>
          left.repositoryId.localeCompare(right.repositoryId),
        )
        .map((item) => `${item.repositoryId}:${item.activeSha}`)
        .join("\n"),
    )
    .digest("hex");
}

export function supportResearchDedupeKey(
  payload: Pick<
    SupportRepositoryResearchJobPayload,
    "workspaceId" | "messageId" | "revisionSetHash"
  >,
) {
  return `mend:support-research:${payload.workspaceId}:${payload.messageId}:${payload.revisionSetHash}`;
}

export function mayQueueSupportResearch(input: {
  retrievalSufficient: boolean;
  productAmbiguous: boolean;
  aiMode: "off" | "draft" | "auto_safe";
  repositories: readonly { repositoryId: string; activeSha: string }[];
}) {
  return (
    !input.retrievalSufficient &&
    !input.productAmbiguous &&
    input.aiMode === "draft" &&
    input.repositories.length > 0 &&
    input.repositories.length <= MAX_RESEARCH_REPOSITORIES &&
    input.repositories.every((item) => /^[a-f0-9]{40,64}$/.test(item.activeSha))
  );
}

const safeRelativePath = (value: string) =>
  Boolean(value) &&
  !value.startsWith("/") &&
  !/^[a-zA-Z]:[\\/]/.test(value) &&
  !value.split(/[\\/]/).includes("..");

export function createSupportResearchArtifact(
  input: Omit<SupportRepositoryResearchArtifact, "contentHash">,
) {
  if (input.repositories.length > MAX_RESEARCH_REPOSITORIES)
    throw new Error("support_research_repository_limit");
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  )
    throw new Error("support_research_confidence_invalid");
  const allowed = new Map(
    input.repositories.map((item) => [item.repositoryId, item.activeSha]),
  );
  let characters = 0;
  for (const fact of input.facts) {
    characters += fact.statement.length;
    if (!fact.statement.trim() || !safeRelativePath(fact.relativePath))
      throw new Error("support_research_evidence_required");
    if (allowed.get(fact.repositoryId) !== fact.activeSha)
      throw new Error("support_research_revision_mismatch");
    if (
      !Number.isInteger(fact.lineStart) ||
      !Number.isInteger(fact.lineEnd) ||
      fact.lineStart < 1 ||
      fact.lineEnd < fact.lineStart
    )
      throw new Error("support_research_line_range_invalid");
  }
  if (
    input.facts.length > MAX_RESEARCH_FILE_READS ||
    characters > MAX_RESEARCH_CHARACTERS
  )
    throw new Error("support_research_budget_exceeded");
  const canonical = {
    ...input,
    productIds: [...input.productIds].sort(),
    repositories: [...input.repositories].sort((left, right) =>
      left.repositoryId.localeCompare(right.repositoryId),
    ),
    facts: [...input.facts],
  };
  return {
    ...canonical,
    contentHash: createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex"),
  } satisfies SupportRepositoryResearchArtifact;
}

export function researchArtifactEvidence(
  artifact: SupportRepositoryResearchArtifact,
): SupportKnowledgeEvidence[] {
  return artifact.facts.map((fact, index) => ({
    evidenceKey: `research:${artifact.contentHash.slice(0, 20)}_${index}`,
    productIds: artifact.productIds,
    sourceKind: "repository_research",
    sourceRevision: fact.activeSha,
    sourcePath: fact.relativePath,
    title: "Pesquisa verificada no produto",
    heading: `Linhas ${fact.lineStart}-${fact.lineEnd}`,
    content: fact.statement,
    trustLevel: "generated",
    audience: "internal",
    score: artifact.confidence,
  }));
}

export function deepResearchMayAutoSend(policy: {
  deepResearchAutoSendEnabled?: boolean;
  latestEvaluationEligible?: boolean;
}) {
  return (
    policy.deepResearchAutoSendEnabled === true &&
    policy.latestEvaluationEligible === true
  );
}

export interface ReadOnlySupportResearchAgent {
  research(input: {
    payload: SupportRepositoryResearchJobPayload;
    maxFileReads: number;
    maxCharacters: number;
    allowNetwork: false;
    allowWrites: false;
    allowCommands: false;
  }): Promise<{
    facts: readonly SupportRepositoryResearchFact[];
    confidence: number;
  }>;
}

export interface SupportResearchArtifactStore {
  find(
    workspaceId: string,
    messageId: string,
    revisionSetHash: string,
  ): Promise<SupportRepositoryResearchArtifact | null>;
  save(artifact: SupportRepositoryResearchArtifact): Promise<void>;
}

export class SupportRepositoryResearchProcessor {
  constructor(
    private readonly agent: ReadOnlySupportResearchAgent,
    private readonly store: SupportResearchArtifactStore,
    private readonly metrics?: KnowledgeMetricWriter,
  ) {}

  async process(
    input: SupportRepositoryResearchJobPayload,
  ): Promise<SupportRepositoryResearchArtifact> {
    const payload = supportRepositoryResearchJobPayloadSchema.parse(input);
    if (
      supportResearchRevisionSetHash(payload.repositories) !==
      payload.revisionSetHash
    )
      throw new Error("support_research_revision_set_mismatch");
    const existing = await this.store.find(
      payload.workspaceId,
      payload.messageId,
      payload.revisionSetHash,
    );
    if (existing) return existing;
    await this.metrics?.record({
      workspaceId: payload.workspaceId,
      workflowId: payload.conversationId,
      factType: "knowledge_deep_research_started",
      idempotencyKey: `${supportResearchDedupeKey(payload)}:started`,
      metadata: {
        messageId: payload.messageId,
        productIds: payload.productIds,
        repositoryCount: payload.repositories.length,
      },
    });
    const result = await this.agent.research({
      payload,
      maxFileReads: MAX_RESEARCH_FILE_READS,
      maxCharacters: MAX_RESEARCH_CHARACTERS,
      allowNetwork: false,
      allowWrites: false,
      allowCommands: false,
    });
    const artifact = createSupportResearchArtifact({
      workspaceId: payload.workspaceId,
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      productIds: payload.productIds,
      repositories: payload.repositories,
      facts: result.facts,
      confidence: result.confidence,
    });
    await this.store.save(artifact);
    await this.metrics?.record({
      workspaceId: payload.workspaceId,
      workflowId: payload.conversationId,
      factType: "knowledge_deep_research_completed",
      idempotencyKey: `${supportResearchDedupeKey(payload)}:completed`,
      valueNumeric: artifact.facts.length,
      metadata: {
        messageId: payload.messageId,
        contentHash: artifact.contentHash,
        factCount: artifact.facts.length,
      },
    });
    return artifact;
  }
}
