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

const REPOSITORY_ARTICLE_SUMMARY_COLUMNS =
  "id, workspace_id, title, category, status, created_by_user_id, created_at, updated_at, managed_by_sync, trust_level, audience, source_id, source_path, source_revision";

export class SupabaseKnowledgeAdapter implements KnowledgePort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly indexingClient: SupabaseClient = client,
    private readonly agentCredentials?: AgentCredentialPort,
  ) {}

  private async productIdsByArticle(
    workspaceId: string,
    articleIds: readonly string[],
  ) {
    const output = new Map<string, string[]>();
    if (!articleIds.length) return output;
    const mappings = rows(
      checked(
        "knowledge_article_products.list",
        await this.client
          .from("knowledge_article_products")
          .select("article_id, product_id")
          .eq("workspace_id", workspaceId)
          .in("article_id", [...articleIds]),
      ),
    );
    for (const mapping of mappings) {
      const articleId = str(mapping.article_id);
      output.set(articleId, [
        ...(output.get(articleId) ?? []),
        str(mapping.product_id),
      ]);
    }
    return output;
  }

  private async replaceProductMappings(
    workspaceId: string,
    articleId: string,
    productIds: readonly string[],
  ): Promise<void> {
    checked(
      "knowledge_article_products.delete",
      await this.indexingClient
        .from("knowledge_article_products")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("article_id", articleId),
    );
    if (!productIds.length) return;
    checked(
      "knowledge_article_products.insert",
      await this.indexingClient.from("knowledge_article_products").insert(
        [...new Set(productIds)].map((productId) => ({
          workspace_id: workspaceId,
          article_id: articleId,
          product_id: productId,
        })),
      ),
    );
  }

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
    let manualRequest = this.client
      .from("knowledge_articles")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("managed_by_sync", false);
    let repositoryRequest = this.client
      .from("knowledge_articles")
      .select(REPOSITORY_ARTICLE_SUMMARY_COLUMNS)
      .eq("workspace_id", context.workspaceId)
      .eq("managed_by_sync", true);
    if (value.status) {
      manualRequest = manualRequest.eq("status", value.status);
      repositoryRequest = repositoryRequest.eq("status", value.status);
    }
    if (value.category) {
      manualRequest = manualRequest.eq("category", value.category);
      repositoryRequest = repositoryRequest.eq("category", value.category);
    }
    if (value.search) {
      manualRequest = manualRequest.ilike("title", `%${value.search}%`);
      repositoryRequest = repositoryRequest.ilike("title", `%${value.search}%`);
    }
    if (value.cursor) {
      manualRequest = manualRequest.gt("id", value.cursor);
      repositoryRequest = repositoryRequest.gt("id", value.cursor);
    }
    const limit = Number(value.limit ?? 100);
    const [manualResult, repositoryResult] = await Promise.all([
      manualRequest.order("updated_at", { ascending: false }).limit(limit),
      repositoryRequest.order("updated_at", { ascending: false }).limit(limit),
    ]);
    const manualRows = rows(
      checked("knowledge_articles.manual_list", manualResult),
    );
    const repositoryRows: Row[] = rows(
      checked("knowledge_articles.repository_list", repositoryResult),
    ).map((item) => ({
      ...item,
      body: str(item.source_path, str(item.title)),
    }));
    const articleRows = [...manualRows, ...repositoryRows]
      .sort((left, right) =>
        str(right.updated_at).localeCompare(str(left.updated_at)),
      )
      .slice(0, limit);
    const mappings = await this.productIdsByArticle(
      context.workspaceId,
      articleRows.map((item) => str(item.id)),
    );
    return articleRows
      .map((item) => ({
        ...article(item),
        productIds: mappings.get(str(item.id)) ?? [],
        managedBySync: Boolean(item.managed_by_sync),
        trustLevel: str(item.trust_level, "reviewed"),
        audience: str(item.audience, "customer"),
        sourcePath: item.source_path ? str(item.source_path) : null,
        sourceRevision: item.source_revision ? str(item.source_revision) : null,
      }))
      .filter((item) =>
        value.productId
          ? (item.productIds as string[]).includes(str(value.productId))
          : value.shared
            ? (item.productIds as string[]).length === 0
            : true,
      );
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
    await this.replaceProductMappings(
      context.workspaceId,
      str(created.id),
      input.productIds,
    );
    await this.syncChunks(created);
    return { ...article(created), productIds: [...new Set(input.productIds)] };
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
      .eq("managed_by_sync", false)
      .select("*")
      .maybeSingle();
    const data = checked("knowledge_articles.update", result);
    if (!data) return null;
    const updated = row(data);
    if (input.productIds !== undefined)
      await this.replaceProductMappings(
        context.workspaceId,
        id,
        input.productIds,
      );
    await this.syncChunks(updated);
    const mappings = await this.productIdsByArticle(context.workspaceId, [id]);
    return { ...article(updated), productIds: mappings.get(id) ?? [] };
  }

  async remove(context: KnowledgeRequestContext, id: string) {
    const result = await this.client
      .from("knowledge_articles")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .eq("managed_by_sync", false)
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
