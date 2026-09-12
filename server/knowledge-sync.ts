import { z } from "zod";

export const KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE =
  "mend.knowledge.repository_sync";

export const knowledgeRepositorySyncJobPayloadSchema = z
  .object({
    stage: z.literal("knowledge_repository_sync"),
    workspaceId: z.string().uuid(),
    sourceId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
    installationId: z.number().int().positive(),
    requestedSha: z.string().regex(/^[a-f0-9]{40,64}$/),
    deliveryId: z.string().trim().min(1).max(200),
  })
  .strict();

export type KnowledgeRepositorySyncJobPayload = z.infer<
  typeof knowledgeRepositorySyncJobPayloadSchema
>;

export interface KnowledgeSource {
  id: string;
  workspaceId: string;
  repositoryId: string;
  refName: string;
  syncMode: "event" | "manual" | "paused";
  observedSha?: string;
  indexedSha?: string;
  activeSha?: string;
  syncState: "idle" | "queued" | "running" | "ready" | "stale" | "failed";
}

export function sourceFreshness(
  source: KnowledgeSource,
): "empty" | "stale" | "current" {
  if (!source.indexedSha || !source.activeSha) return "empty";
  return source.indexedSha === source.activeSha && source.syncState === "ready"
    ? "current"
    : "stale";
}

export function knowledgeSyncDedupeKey(
  payload: KnowledgeRepositorySyncJobPayload,
): string {
  return `mend:knowledge-sync:${payload.workspaceId}:${payload.sourceId}:${payload.requestedSha}`;
}
