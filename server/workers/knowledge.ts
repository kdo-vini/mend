import { type LiveWorkerKnowledgeArticle } from "../automation/decision.js";
import type { AgentCredentialPort } from "../contracts/api-ports.js";
import { OpenAiKnowledgeEmbeddings } from "../knowledge-retrieval.js";
import {
  resolveSupportProducts,
  type ProductResolution,
  type SupportProduct,
} from "../knowledge-products.js";
import type {
  KnowledgeArticleRow,
  LiveWorkerKnowledge,
  LiveWorkerSupabaseClient,
} from "../live-worker.js";
import type { KnowledgeMetricWriter } from "../knowledge-evals.js";
export class SupabaseLiveWorkerKnowledge implements LiveWorkerKnowledge {
  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly maxArticles = 20,
    private readonly maxTotalCharacters = 50_000,
    private readonly agentCredentials?: AgentCredentialPort,
    private readonly metrics?: KnowledgeMetricWriter,
  ) {}

  private async metric(input: Parameters<KnowledgeMetricWriter["record"]>[0]) {
    try {
      await this.metrics?.record(input);
    } catch {
      // Telemetry must never prevent support processing.
    }
  }

  async resolveProducts(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    text: string,
  ): Promise<ProductResolution> {
    const productsResult = await this.client
      .from("support_products")
      .select(
        "id, workspace_id, product_key, name, description, aliases, status",
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    if (productsResult.error)
      throw new Error(
        `supabase:support_products:${productsResult.error.message}`,
      );
    const products: SupportProduct[] = (productsResult.data ?? []).map(
      (value) => {
        const item = value as Record<string, unknown>;
        return {
          id: String(item.id),
          workspaceId: String(item.workspace_id),
          key: String(item.product_key),
          name: String(item.name),
          description: String(item.description ?? ""),
          aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
          status: "active",
        };
      },
    );
    if (!products.length)
      return {
        productIds: [],
        confidence: 1,
        source: "shared",
        ambiguous: false,
      };
    const explicit = resolveSupportProducts(text, products);
    if (!explicit.ambiguous) {
      await this.client
        .from("conversation_product_context")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("conversation_id", conversationId);
      const insert = await this.client
        .from("conversation_product_context")
        .insert(
          explicit.productIds.map((productId) => ({
            workspace_id: workspaceId,
            conversation_id: conversationId,
            product_id: productId,
            is_primary: productId === explicit.primaryProductId,
            confidence: explicit.confidence,
            resolution_source: "alias",
            last_message_id: messageId,
          })),
        );
      if (insert.error)
        throw new Error(
          `supabase:conversation_product_context:${insert.error.message}`,
        );
      return explicit;
    }
    const contextResult = await this.client
      .from("conversation_product_context")
      .select("product_id, is_primary, confidence")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId);
    if (contextResult.error)
      throw new Error(
        `supabase:conversation_product_context:${contextResult.error.message}`,
      );
    const context = (contextResult.data ?? []) as Array<
      Record<string, unknown>
    >;
    if (context.length) {
      const primary = context.find((item) => item.is_primary);
      return {
        productIds: context.map((item) => String(item.product_id)),
        ...(primary ? { primaryProductId: String(primary.product_id) } : {}),
        confidence: Math.min(
          ...context.map((item) => Number(item.confidence ?? 0)),
        ),
        source: "conversation",
        ambiguous: false,
      };
    }
    await this.metric({
      workspaceId,
      workflowId: conversationId,
      factType: "knowledge_product_ambiguous",
      idempotencyKey: `knowledge-product:${messageId}:ambiguous`,
      metadata: { messageId, candidateProductIds: explicit.productIds },
    });
    return explicit;
  }

  async listPublished(
    workspaceId: string,
    query?: string,
    productIds: readonly string[] = [],
    metricContext?: { conversationId: string; messageId: string },
  ): Promise<readonly LiveWorkerKnowledgeArticle[]> {
    const startedAt = Date.now();
    if (query?.trim()) {
      let queryEmbedding: readonly number[] | undefined;
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
        queryEmbedding = await new OpenAiKnowledgeEmbeddings(
          credential.apiKey,
          embeddingModel,
        ).embed(query);
      }
      const result = await (
        this.client as unknown as {
          rpc(
            name: string,
            parameters: Record<string, unknown>,
          ): Promise<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        }
      ).rpc("match_product_knowledge_chunks", {
        p_workspace_id: workspaceId,
        p_product_ids: productIds,
        p_query: query,
        p_limit: Math.min(this.maxArticles, 20),
        p_min_score: 0.08,
        ...(queryEmbedding ? { p_query_embedding: queryEmbedding } : {}),
      });
      if (result.error)
        throw new Error(`supabase:knowledge_chunks:${result.error.message}`);
      const articles: LiveWorkerKnowledgeArticle[] = (result.data ?? []).map(
        (value) => {
          const chunk = value as Record<string, unknown>;
          const title = String(chunk.article_title ?? "Published knowledge");
          const heading = String(chunk.heading ?? "");
          return {
            id: String(chunk.article_id),
            title,
            category: heading || "Support",
            body: String(chunk.content ?? ""),
            retrievalScore: Number(chunk.hybrid_score ?? 0),
            citation: `${title}${heading ? ` — ${heading}` : ""}`,
            evidenceKey: `kb:${String(chunk.chunk_id)}`,
            chunkId: String(chunk.chunk_id),
            articleVersion: String(chunk.article_version),
            productIds: Array.isArray(chunk.product_ids)
              ? chunk.product_ids.map(String)
              : [],
            sourceRevision: chunk.source_revision
              ? String(chunk.source_revision)
              : undefined,
            sourcePath: chunk.source_path
              ? String(chunk.source_path)
              : undefined,
            sourceKind:
              chunk.source_kind === "repository" ? "repository" : "manual",
            trustLevel:
              chunk.trust_level === "deterministic"
                ? "deterministic"
                : chunk.trust_level === "generated"
                  ? "generated"
                  : "reviewed",
            audience: chunk.audience === "internal" ? "internal" : "customer",
          };
        },
      );
      if (metricContext)
        await this.metric({
          workspaceId,
          workflowId: metricContext.conversationId,
          factType: articles.length
            ? "knowledge_retrieval_sufficient"
            : "knowledge_retrieval_insufficient",
          idempotencyKey: `knowledge-retrieval:${metricContext.messageId}`,
          valueNumeric: articles.length,
          metadata: {
            messageId: metricContext.messageId,
            productIds: [...productIds],
            evidenceCount: articles.length,
            topScore: Math.max(
              0,
              ...articles.map((article) => article.retrievalScore ?? 0),
            ),
            activeRevisionMatch: true,
            elapsedMs: Date.now() - startedAt,
          },
        });
      return articles;
    }
    const result = await this.client
      .from("knowledge_articles")
      .select("id, title, category, body")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(this.maxArticles);
    if (result.error)
      throw new Error(`supabase:knowledge_articles:${result.error.message}`);

    let remaining = Math.max(0, this.maxTotalCharacters);
    const articles: LiveWorkerKnowledgeArticle[] = [];
    for (const row of result.data ?? []) {
      if (remaining <= 0) break;
      const article = row as Pick<
        KnowledgeArticleRow,
        "id" | "title" | "category" | "body"
      >;
      const body = article.body.slice(0, remaining);
      articles.push({
        id: String(article.id),
        title: String(article.title),
        category: String(article.category),
        body,
      });
      remaining -= body.length;
    }
    return articles;
  }
}
