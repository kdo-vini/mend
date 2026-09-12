import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GitHubRepositoryRef } from "./github-control-plane.js";
import {
  chunkPublishedArticle,
  type KnowledgeEmbeddingPort,
} from "./knowledge-retrieval.js";
import {
  extractRepositoryKnowledge,
  type RepositoryExtractionResult,
} from "./knowledge-source-extractor.js";
import type { KnowledgeRepositorySyncJobPayload } from "./knowledge-sync.js";
import type { KnowledgeMetricWriter } from "./knowledge-evals.js";

export interface RepositoryArchivePort {
  checkoutRepositoryArchive(
    repository: GitHubRepositoryRef,
    ref: string,
    destination: string,
  ): Promise<void>;
}

export interface KnowledgeSourceIndexConfiguration {
  includePatterns: readonly string[];
  excludePatterns: readonly string[];
}

export interface RepositoryKnowledgeDocumentWrite {
  relativePath: string;
  title: string;
  body: string;
  contentHash: string;
  chunks: readonly {
    index: number;
    heading: string;
    content: string;
    contentHash: string;
    embedding?: readonly number[];
  }[];
}

export interface KnowledgeSourceIndexResult extends RepositoryExtractionResult {
  chunksWritten: number;
  chunksReused: number;
  embeddingInputCount: number;
}

export interface KnowledgeSourceIndexStore {
  begin(
    payload: KnowledgeRepositorySyncJobPayload,
  ): Promise<KnowledgeSourceIndexConfiguration>;
  writeDocuments(
    payload: KnowledgeRepositorySyncJobPayload,
    documents: readonly RepositoryKnowledgeDocumentWrite[],
  ): Promise<void>;
  findReusableEmbeddings?(
    payload: KnowledgeRepositorySyncJobPayload,
    contentHashes: readonly string[],
  ): Promise<ReadonlyMap<string, readonly number[]>>;
  complete(
    payload: KnowledgeRepositorySyncJobPayload,
    result: KnowledgeSourceIndexResult,
  ): Promise<void>;
  fail(
    payload: KnowledgeRepositorySyncJobPayload,
    errorCode: string,
  ): Promise<void>;
}

const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_CONCURRENCY = 4;

async function embedInBatches(
  embeddings: KnowledgeEmbeddingPort & {
    embedMany?(values: readonly string[]): Promise<readonly number[][]>;
  },
  values: readonly string[],
): Promise<readonly (readonly number[])[]> {
  if (!embeddings.embedMany)
    return Promise.all(values.map((value) => embeddings.embed(value)));
  const batches: string[][] = [];
  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE)
    batches.push(values.slice(index, index + EMBEDDING_BATCH_SIZE));
  const results: Array<readonly number[][]> = new Array(batches.length);
  let nextBatch = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(EMBEDDING_CONCURRENCY, batches.length) },
      async () => {
        while (nextBatch < batches.length) {
          const index = nextBatch;
          nextBatch += 1;
          results[index] = await embeddings.embedMany!(batches[index]!);
        }
      },
    ),
  );
  return results.flat();
}

export class KnowledgeSourceIndexer {
  constructor(
    private readonly github: RepositoryArchivePort,
    private readonly store: KnowledgeSourceIndexStore,
    private readonly embeddings?: KnowledgeEmbeddingPort & {
      embedMany?(values: readonly string[]): Promise<readonly number[][]>;
    },
    private readonly metrics?: KnowledgeMetricWriter,
  ) {}

  async process(payload: KnowledgeRepositorySyncJobPayload): Promise<void> {
    const startedAt = Date.now();
    await this.metrics?.record({
      workspaceId: payload.workspaceId,
      workflowId: payload.sourceId,
      factType: "knowledge_sync_started",
      idempotencyKey: `knowledge-sync:${payload.sourceId}:${payload.requestedSha}:started`,
      metadata: { sourceId: payload.sourceId, revision: payload.requestedSha },
    });
    const configuration = await this.store.begin(payload);
    const directory = await mkdtemp(
      path.join(tmpdir(), "mend-knowledge-sync-"),
    );
    try {
      await this.github.checkoutRepositoryArchive(
        {
          owner: payload.owner,
          repo: payload.repo,
          installationId: payload.installationId,
        },
        payload.requestedSha,
        directory,
      );
      const extracted = await extractRepositoryKnowledge(directory, {
        includePatterns: configuration.includePatterns,
        excludePatterns: configuration.excludePatterns,
      });
      const prepared = extracted.documents.map((document) => ({
        document,
        chunks: chunkPublishedArticle({
          id: `${payload.sourceId}:${document.relativePath}`,
          workspaceId: payload.workspaceId,
          title: document.title,
          status: "published",
          body: document.body,
          updatedAt: payload.requestedSha,
        }),
      }));
      const reusableEmbeddings =
        this.embeddings && this.store.findReusableEmbeddings
          ? await this.store.findReusableEmbeddings(payload, [
              ...new Set(
                prepared.flatMap((item) =>
                  item.chunks.map((chunk) => chunk.contentHash),
                ),
              ),
            ])
          : new Map<string, readonly number[]>();
      let chunksWritten = 0;
      let chunksReused = 0;
      let embeddingInputCount = 0;
      let pending: typeof prepared = [];
      let pendingChunkCount = 0;
      const flush = async () => {
        if (!pending.length) return;
        const chunks = pending.flatMap((item) => item.chunks);
        const missing = chunks.filter(
          (chunk) => !reusableEmbeddings.has(chunk.contentHash),
        );
        const generatedVectors = this.embeddings
          ? await embedInBatches(
              this.embeddings,
              missing.map((chunk) => chunk.content),
            )
          : [];
        embeddingInputCount += missing.length;
        const generatedByHash = new Map(
          missing.map((chunk, index) => [
            chunk.contentHash,
            generatedVectors[index] ?? [],
          ]),
        );
        const vectors = chunks.map((chunk) => {
          const reusable = reusableEmbeddings.get(chunk.contentHash);
          if (reusable) chunksReused += 1;
          return reusable ?? generatedByHash.get(chunk.contentHash) ?? [];
        });
        let offset = 0;
        const writes: RepositoryKnowledgeDocumentWrite[] = [];
        for (const item of pending) {
          const documentVectors = vectors.slice(
            offset,
            offset + item.chunks.length,
          );
          writes.push({
            ...item.document,
            chunks: item.chunks.map((chunk, index) => ({
              index: chunk.index,
              heading: chunk.heading,
              content: chunk.content,
              contentHash: chunk.contentHash,
              ...(documentVectors[index]
                ? { embedding: documentVectors[index] }
                : {}),
            })),
          });
          offset += item.chunks.length;
          chunksWritten += item.chunks.length;
        }
        await this.store.writeDocuments(payload, writes);
        pending = [];
        pendingChunkCount = 0;
      };
      for (const item of prepared) {
        if (
          pending.length &&
          pendingChunkCount + item.chunks.length > EMBEDDING_BATCH_SIZE
        )
          await flush();
        pending.push(item);
        pendingChunkCount += item.chunks.length;
        if (pendingChunkCount >= EMBEDDING_BATCH_SIZE) await flush();
      }
      await flush();
      await this.store.complete(payload, {
        ...extracted,
        chunksWritten,
        chunksReused,
        embeddingInputCount,
      });
      await this.metrics?.record({
        workspaceId: payload.workspaceId,
        workflowId: payload.sourceId,
        factType: "knowledge_sync_completed",
        idempotencyKey: `knowledge-sync:${payload.sourceId}:${payload.requestedSha}:completed`,
        valueNumeric: chunksWritten,
        metadata: {
          sourceId: payload.sourceId,
          revision: payload.requestedSha,
          filesScanned: extracted.filesScanned,
          filesIndexed: extracted.documents.length,
          filesSkipped: extracted.filesSkipped,
          chunksWritten,
          chunksReused,
          embeddingInputCount,
          elapsedMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const errorCode = safeIndexErrorCode(error);
      await this.store.fail(payload, errorCode);
      await this.metrics?.record({
        workspaceId: payload.workspaceId,
        workflowId: payload.sourceId,
        factType: "knowledge_sync_failed",
        idempotencyKey: `knowledge-sync:${payload.sourceId}:${payload.requestedSha}:failed`,
        metadata: {
          sourceId: payload.sourceId,
          revision: payload.requestedSha,
          errorCode,
          elapsedMs: Date.now() - startedAt,
        },
      });
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function safeIndexErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = message
    .split(":", 1)[0]
    ?.replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase();
  return (code || "knowledge_sync_failed").slice(0, 120);
}
