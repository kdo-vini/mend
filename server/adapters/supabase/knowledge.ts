import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCredentialPort } from "../../contracts/api-ports.js";
import type {
  KnowledgeCreateInput,
  KnowledgeListQuery,
  KnowledgePatchInput,
  KnowledgePort,
  KnowledgeRequestContext,
} from "../../knowledge-service.js";
import {
  chunkPublishedArticle,
  OpenAiKnowledgeEmbeddings,
} from "../../knowledge-retrieval.js";
import {
  article,
  checked,
  row,
  rows,
  str,
  type Row,
} from "../supabase-mappers.js";

export class SupabaseKnowledgeAdapter implements KnowledgePort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly indexingClient: SupabaseClient = client,
    private readonly agentCredentials?: AgentCredentialPort,
  ) {}

  private async syncChunks(value: Row): Promise<void> {
    const articleId = str(value.id);
    const workspaceId = str(value.workspace_id);
    checked(
      "knowledge_chunks.delete",
      await this.indexingClient
        .from("knowledge_chunks")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("article_id", articleId),
    );
    const chunks = chunkPublishedArticle({
      id: articleId,
      workspaceId,
      title: str(value.title),
      status: str(value.status) === "published" ? "published" : "draft",
      body: str(value.body),
      updatedAt: str(value.updated_at),
    });
    if (!chunks.length) return;

    let embeddings: readonly number[][] = [];
    if (this.agentCredentials) {
      const credential = await this.agentCredentials.resolve(
        workspaceId,
        "support",
        "openai",
      );
      if (!credential) throw new Error("support_ai_configuration_required");
      const embeddingModel = credential?.config.embeddingModel;
      if (typeof embeddingModel !== "string" || !embeddingModel.trim())
        throw new Error("support_ai_model_missing");
      embeddings = await new OpenAiKnowledgeEmbeddings(
        credential.apiKey,
        embeddingModel,
      ).embedMany(chunks.map((chunk) => chunk.content));
    }

    checked(
      "knowledge_chunks.insert",
      await this.indexingClient.from("knowledge_chunks").insert(
        chunks.map((chunk, index) => ({
          workspace_id: chunk.workspaceId,
          article_id: chunk.articleId,
          article_version: chunk.articleVersion,
          chunk_index: chunk.index,
          heading: chunk.heading,
          content: chunk.content,
          content_hash: chunk.contentHash,
          ...(embeddings[index] ? { embedding: embeddings[index] } : {}),
        })),
      ),
    );
  }

  async list(context: KnowledgeRequestContext, query: KnowledgeListQuery) {
    const value = query as unknown as Row;
    let request = this.client
      .from("knowledge_articles")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (value.status) request = request.eq("status", value.status);
    if (value.category) request = request.eq("category", value.category);
    if (value.search) request = request.ilike("title", `%${value.search}%`);
    if (value.cursor) request = request.gt("id", value.cursor);
    const result = await request
      .order("updated_at", { ascending: false })
      .limit(Number(value.limit ?? 100));
    return rows(checked("knowledge_articles.list", result)).map(article);
  }

  async create(context: KnowledgeRequestContext, input: KnowledgeCreateInput) {
    const result = await this.client
      .from("knowledge_articles")
      .insert({
        workspace_id: context.workspaceId,
        title: input.title,
        category: input.category,
        body: input.body,
        status: input.status,
        created_by_user_id: context.userId,
      })
      .select("*")
      .single();
    const created = row(checked("knowledge_articles.create", result));
    await this.syncChunks(created);
    return article(created);
  }

  async update(
    context: KnowledgeRequestContext,
    id: string,
    input: KnowledgePatchInput,
  ) {
    const value = input as unknown as Row;
    const result = await this.client
      .from("knowledge_articles")
      .update({
        ...(value.title !== undefined ? { title: value.title } : {}),
        ...(value.category !== undefined ? { category: value.category } : {}),
        ...(value.body !== undefined ? { body: value.body } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("knowledge_articles.update", result);
    if (!data) return null;
    const updated = row(data);
    await this.syncChunks(updated);
    return article(updated);
  }

  async remove(context: KnowledgeRequestContext, id: string) {
    const result = await this.client
      .from("knowledge_articles")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("knowledge_articles.delete", result)).length > 0;
  }
}

export {
  chunkPublishedArticle,
  KnowledgeRetriever,
  OpenAiKnowledgeEmbeddings,
} from "../../knowledge-retrieval.js";
export type {
  IndexedKnowledgeChunk,
  KnowledgeArticleForIndexing,
  KnowledgeEmbeddingPort,
  KnowledgeSearchPort,
  KnowledgeSearchResult,
} from "../../knowledge-retrieval.js";
