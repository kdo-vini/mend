import { type LiveWorkerKnowledgeArticle } from "../automation/decision.js";
import type { AgentCredentialPort } from "../contracts/api-ports.js";
import { OpenAiKnowledgeEmbeddings } from "../knowledge-retrieval.js";
import type {
  KnowledgeArticleRow,
  LiveWorkerKnowledge,
  LiveWorkerSupabaseClient,
} from "../live-worker.js";
export class SupabaseLiveWorkerKnowledge implements LiveWorkerKnowledge {
  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly maxArticles = 20,
    private readonly maxTotalCharacters = 50_000,
    private readonly agentCredentials?: AgentCredentialPort,
  ) {}

  async listPublished(
    workspaceId: string,
    query?: string,
  ): Promise<readonly LiveWorkerKnowledgeArticle[]> {
    if (query?.trim()) {
      let queryEmbedding: readonly number[] | undefined;
      if (this.agentCredentials) {
        const credential = await this.agentCredentials.resolve(
          workspaceId,
          "support",
          "openai",
        );
        const embeddingModel = credential?.config.embeddingModel;
        if (
          credential &&
          typeof embeddingModel === "string" &&
          embeddingModel.trim()
        )
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
      ).rpc("match_knowledge_chunks", {
        p_workspace_id: workspaceId,
        p_query: query,
        p_limit: Math.min(this.maxArticles, 20),
        p_min_score: 0.08,
        ...(queryEmbedding ? { p_query_embedding: queryEmbedding } : {}),
      });
      if (result.error)
        throw new Error(`supabase:knowledge_chunks:${result.error.message}`);
      return (result.data ?? []).map((value) => {
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
        };
      });
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
