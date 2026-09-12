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

export interface KnowledgeSourceIndexStore {
  begin(
    payload: KnowledgeRepositorySyncJobPayload,
  ): Promise<KnowledgeSourceIndexConfiguration>;
  writeDocument(
    payload: KnowledgeRepositorySyncJobPayload,
    document: RepositoryKnowledgeDocumentWrite,
  ): Promise<void>;
  complete(
    payload: KnowledgeRepositorySyncJobPayload,
    result: RepositoryExtractionResult,
  ): Promise<void>;
  fail(
    payload: KnowledgeRepositorySyncJobPayload,
    errorCode: string,
  ): Promise<void>;
}

export class KnowledgeSourceIndexer {
  constructor(
    private readonly github: RepositoryArchivePort,
    private readonly store: KnowledgeSourceIndexStore,
    private readonly embeddings?: KnowledgeEmbeddingPort & {
      embedMany?(values: readonly string[]): Promise<readonly number[][]>;
    },
  ) {}

  async process(payload: KnowledgeRepositorySyncJobPayload): Promise<void> {
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
      for (const document of extracted.documents) {
        const chunks = chunkPublishedArticle({
          id: `${payload.sourceId}:${document.relativePath}`,
          workspaceId: payload.workspaceId,
          title: document.title,
          status: "published",
          body: document.body,
          updatedAt: payload.requestedSha,
        });
        const vectors = this.embeddings
          ? this.embeddings.embedMany
            ? await this.embeddings.embedMany(
                chunks.map((chunk) => chunk.content),
              )
            : await Promise.all(
                chunks.map((chunk) => this.embeddings!.embed(chunk.content)),
              )
          : [];
        await this.store.writeDocument(payload, {
          ...document,
          chunks: chunks.map((chunk, index) => ({
            index: chunk.index,
            heading: chunk.heading,
            content: chunk.content,
            contentHash: chunk.contentHash,
            ...(vectors[index] ? { embedding: vectors[index] } : {}),
          })),
        });
      }
      await this.store.complete(payload, extracted);
    } catch (error) {
      await this.store.fail(payload, safeIndexErrorCode(error));
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
