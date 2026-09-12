import type { AnySupabaseClient } from "../adapters/supabase/types.js";
import { checked, row, rows, str } from "../adapters/supabase-mappers.js";
import type { AgentCredentialPort } from "../contracts/api-ports.js";
import type { GitHubControlPlane } from "../github-control-plane.js";
import type { KnowledgeMetricWriter } from "../knowledge-evals.js";
import {
  KnowledgeSourceIndexer,
  type KnowledgeSourceIndexStore,
  type RepositoryKnowledgeDocumentWrite,
} from "../knowledge-source-indexer.js";
import { OpenAiKnowledgeEmbeddings } from "../knowledge-retrieval.js";
import type { KnowledgeRepositorySyncJobPayload } from "../knowledge-sync.js";

const KNOWLEDGE_CHUNK_WRITE_BATCH_SIZE = 8;
const KNOWLEDGE_ARTICLE_WRITE_BATCH_SIZE = 10;

function parseVector(value: unknown): number[] {
  const values = Array.isArray(value)
    ? value.map(Number)
    : typeof value === "string"
      ? value
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map(Number)
      : [];
  return values.length === 1_536 && values.every(Number.isFinite) ? values : [];
}

export async function insertKnowledgeChunkRows(
  client: AnySupabaseClient,
  values: readonly Record<string, unknown>[],
): Promise<void> {
  for (
    let index = 0;
    index < values.length;
    index += KNOWLEDGE_CHUNK_WRITE_BATCH_SIZE
  ) {
    checked(
      "knowledge_chunks.replace.insert",
      await client
        .from("knowledge_chunks")
        .insert(
          values.slice(
            index,
            index + KNOWLEDGE_CHUNK_WRITE_BATCH_SIZE,
          ) as never,
        ),
    );
  }
}

class SupabaseKnowledgeSourceIndexStore implements KnowledgeSourceIndexStore {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly embeddingModel: string,
  ) {}

  async findReusableEmbeddings(
    payload: KnowledgeRepositorySyncJobPayload,
    contentHashes: readonly string[],
  ) {
    const reusable = new Map<string, readonly number[]>();
    for (let index = 0; index < contentHashes.length; index += 25) {
      const result = await this.client
        .from("knowledge_chunks")
        .select("content_hash,embedding")
        .eq("workspace_id", payload.workspaceId)
        .eq("embedding_model", this.embeddingModel)
        .in("content_hash", contentHashes.slice(index, index + 25))
        .not("embedding", "is", null);
      for (const item of rows(checked("knowledge_chunks.reuse", result))) {
        const hash = str(item.content_hash);
        const value = parseVector(item.embedding);
        if (hash && value.length) reusable.set(hash, value);
      }
    }
    return reusable;
  }

  async begin(payload: KnowledgeRepositorySyncJobPayload) {
    const result = await this.client
      .from("knowledge_sources")
      .select("include_patterns, exclude_patterns")
      .eq("workspace_id", payload.workspaceId)
      .eq("id", payload.sourceId)
      .eq("repository_id", payload.repositoryId)
      .neq("sync_mode", "paused")
      .maybeSingle();
    const source = row(checked("knowledge_sources.begin_sync", result));
    checked(
      "knowledge_sync_runs.begin",
      await this.client.from("knowledge_sync_runs").upsert(
        {
          workspace_id: payload.workspaceId,
          source_id: payload.sourceId,
          requested_sha: payload.requestedSha,
          status: "running",
          started_at: new Date().toISOString(),
          finished_at: null,
          error_code: null,
        },
        { onConflict: "source_id,requested_sha" },
      ),
    );
    checked(
      "knowledge_sources.running",
      await this.client
        .from("knowledge_sources")
        .update({
          observed_sha: payload.requestedSha,
          sync_state: "running",
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", payload.workspaceId)
        .eq("id", payload.sourceId),
    );
    return {
      includePatterns: Array.isArray(source.include_patterns)
        ? source.include_patterns.map(String)
        : [],
      excludePatterns: Array.isArray(source.exclude_patterns)
        ? source.exclude_patterns.map(String)
        : [],
    };
  }

  async writeDocuments(
    payload: KnowledgeRepositorySyncJobPayload,
    documents: readonly RepositoryKnowledgeDocumentWrite[],
  ) {
    for (
      let index = 0;
      index < documents.length;
      index += KNOWLEDGE_ARTICLE_WRITE_BATCH_SIZE
    ) {
      const batch = documents.slice(
        index,
        index + KNOWLEDGE_ARTICLE_WRITE_BATCH_SIZE,
      );
      const articleResult = await this.client
        .from("knowledge_articles")
        .upsert(
          batch.map((document) => ({
            workspace_id: payload.workspaceId,
            title: document.title,
            category: "Repository",
            body: document.body,
            status: "published",
            source_id: payload.sourceId,
            source_path: document.relativePath,
            source_revision: payload.requestedSha,
            managed_by_sync: true,
            trust_level: "deterministic",
            audience: "customer",
            source_metadata_json: {
              contentHash: document.contentHash,
              bytes: document.body.length,
            },
            updated_at: new Date().toISOString(),
          })) as never,
          { onConflict: "source_id,source_path,source_revision" },
        )
        .select("id,source_path");
      const articleRows = rows(
        checked("knowledge_articles.write_managed", articleResult),
      );
      const articleIdByPath = new Map(
        articleRows.map((article) => [
          str(article.source_path),
          str(article.id),
        ]),
      );
      const articleIds = [...articleIdByPath.values()];
      checked(
        "knowledge_chunks.replace.delete",
        await this.client
          .from("knowledge_chunks")
          .delete()
          .eq("workspace_id", payload.workspaceId)
          .in("article_id", articleIds),
      );
      await insertKnowledgeChunkRows(
        this.client,
        batch.flatMap((document) => {
          const articleId = articleIdByPath.get(document.relativePath);
          if (!articleId) throw new Error("knowledge_article_write_missing_id");
          return document.chunks.map((chunk) => ({
            workspace_id: payload.workspaceId,
            article_id: articleId,
            article_version: payload.requestedSha,
            chunk_index: chunk.index,
            heading: chunk.heading,
            content: chunk.content,
            content_hash: chunk.contentHash,
            ...(chunk.embedding ? { embedding: [...chunk.embedding] } : {}),
            ...(chunk.embedding
              ? { embedding_model: this.embeddingModel }
              : {}),
          }));
        }),
      );
    }
  }

  async complete(
    payload: KnowledgeRepositorySyncJobPayload,
    result: {
      filesScanned: number;
      filesSkipped: number;
      documents: readonly unknown[];
      chunksWritten: number;
      chunksReused?: number;
      embeddingInputCount?: number;
    },
  ) {
    const now = new Date().toISOString();
    const sourceResult = await this.client
      .from("knowledge_sources")
      .select("active_sha")
      .eq("workspace_id", payload.workspaceId)
      .eq("id", payload.sourceId)
      .single();
    const source = row(
      checked("knowledge_sources.complete.read", sourceResult),
    );
    const activeSha = source.active_sha;
    checked(
      "knowledge_sources.complete",
      await this.client
        .from("knowledge_sources")
        .update({
          indexed_sha: payload.requestedSha,
          sync_state: activeSha === payload.requestedSha ? "ready" : "stale",
          last_sync_at: now,
          last_error_code: null,
          updated_at: now,
        })
        .eq("workspace_id", payload.workspaceId)
        .eq("id", payload.sourceId),
    );
    checked(
      "knowledge_sync_runs.complete",
      await this.client
        .from("knowledge_sync_runs")
        .update({
          status: "completed",
          files_scanned: result.filesScanned,
          files_indexed: result.documents.length,
          files_skipped: result.filesSkipped,
          chunks_written: result.chunksWritten,
          chunks_reused: result.chunksReused ?? 0,
          embedding_input_count:
            result.embeddingInputCount ?? result.chunksWritten,
          finished_at: now,
        })
        .eq("workspace_id", payload.workspaceId)
        .eq("source_id", payload.sourceId)
        .eq("requested_sha", payload.requestedSha),
    );
  }

  async fail(payload: KnowledgeRepositorySyncJobPayload, errorCode: string) {
    const now = new Date().toISOString();
    checked(
      "knowledge_sync_runs.fail",
      await this.client
        .from("knowledge_sync_runs")
        .update({ status: "failed", error_code: errorCode, finished_at: now })
        .eq("workspace_id", payload.workspaceId)
        .eq("source_id", payload.sourceId)
        .eq("requested_sha", payload.requestedSha),
    );
    checked(
      "knowledge_sources.fail",
      await this.client
        .from("knowledge_sources")
        .update({
          sync_state: "failed",
          last_error_code: errorCode,
          updated_at: now,
        })
        .eq("workspace_id", payload.workspaceId)
        .eq("id", payload.sourceId),
    );
  }
}

export class SupabaseKnowledgeSyncProcessor {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly github: GitHubControlPlane,
    private readonly credentials: AgentCredentialPort,
    private readonly metrics?: KnowledgeMetricWriter,
  ) {}

  async process(payload: KnowledgeRepositorySyncJobPayload): Promise<void> {
    const credential = await this.credentials.resolve(
      payload.workspaceId,
      "support",
      "openai",
    );
    if (!credential) throw new Error("support_ai_configuration_required");
    const model = credential.config.embeddingModel;
    if (typeof model !== "string" || !model.trim())
      throw new Error("support_ai_model_missing");
    await new KnowledgeSourceIndexer(
      this.github,
      new SupabaseKnowledgeSourceIndexStore(this.client, model),
      new OpenAiKnowledgeEmbeddings(credential.apiKey, model),
      this.metrics,
    ).process(payload);
  }
}
