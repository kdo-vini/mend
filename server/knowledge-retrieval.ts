import { createHash } from "node:crypto";
import OpenAI from "openai";

export interface KnowledgeArticleForIndexing {
  id: string;
  workspaceId: string;
  title: string;
  status: "draft" | "published";
  body: string;
  updatedAt: string;
}

export interface IndexedKnowledgeChunk {
  articleId: string;
  workspaceId: string;
  articleVersion: string;
  index: number;
  heading: string;
  content: string;
  contentHash: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function splitBounded(value: string, maximum: number): string[] {
  const pieces: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maximum) {
    const candidate = remaining.slice(0, maximum + 1);
    const boundary = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("; "),
      candidate.lastIndexOf(" "),
    );
    const length =
      boundary >= Math.floor(maximum * 0.55) ? boundary + 1 : maximum;
    pieces.push(remaining.slice(0, length).trim());
    remaining = remaining.slice(length).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

/** Deterministic semantic chunking that preserves Markdown section headings. */
export function chunkPublishedArticle(
  article: KnowledgeArticleForIndexing,
  options: { maxCharacters?: number } = {},
): IndexedKnowledgeChunk[] {
  if (article.status !== "published") return [];
  const maximum = Math.max(50, Math.min(options.maxCharacters ?? 1_200, 8_000));
  const version = digest(
    `${article.id}\n${article.title}\n${article.body}\n${article.updatedAt}`,
  );
  let heading = article.title.trim();
  const sections: Array<{ heading: string; content: string }> = [];
  for (const block of article.body.split(/\n\s*\n/g)) {
    const normalized = block.trim();
    if (!normalized) continue;
    const markdownHeading = /^#{1,6}\s+(.+)$/.exec(normalized);
    if (markdownHeading?.[1]) {
      heading = markdownHeading[1].trim();
      continue;
    }
    for (const content of splitBounded(normalized, maximum))
      sections.push({ heading, content });
  }
  return sections.map((section, index) => ({
    articleId: article.id,
    workspaceId: article.workspaceId,
    articleVersion: version,
    index,
    heading: section.heading,
    content: section.content,
    contentHash: digest(section.content),
  }));
}

export interface KnowledgeSearchResult {
  chunkId: string;
  articleId: string;
  articleTitle: string;
  heading: string;
  content: string;
  lexicalScore: number;
  semanticScore: number;
  hybridScore: number;
  articleVersion: string;
}

export interface KnowledgeSearchPort {
  query(input: {
    workspaceId: string;
    query: string;
    limit: number;
    minimumScore: number;
    queryEmbedding?: readonly number[];
  }): Promise<readonly KnowledgeSearchResult[]>;
}

export interface KnowledgeEmbeddingPort {
  embed(query: string): Promise<readonly number[]>;
}

export interface KnowledgeEmbeddingsClient {
  embeddings: {
    create(input: {
      model: string;
      input: string | string[];
      dimensions: 1536;
    }): Promise<{ data: Array<{ embedding: number[]; index: number }> }>;
  };
}

export class OpenAiKnowledgeEmbeddings implements KnowledgeEmbeddingPort {
  private readonly client: KnowledgeEmbeddingsClient;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: KnowledgeEmbeddingsClient,
  ) {
    if (!apiKey.trim()) throw new Error("support_ai_credential_required");
    if (!model.trim()) throw new Error("support_ai_embedding_model_required");
    this.client =
      client ??
      (new OpenAI({ apiKey }) as unknown as KnowledgeEmbeddingsClient);
  }

  async embed(query: string): Promise<readonly number[]> {
    return (await this.embedMany([query]))[0] ?? [];
  }

  async embedMany(values: readonly string[]): Promise<readonly number[][]> {
    if (!values.length) return [];
    const result = await this.client.embeddings.create({
      model: this.model,
      input: [...values],
      dimensions: 1536,
    });
    const ordered = [...result.data].sort(
      (left, right) => left.index - right.index,
    );
    if (
      ordered.length !== values.length ||
      ordered.some((item) => item.embedding.length !== 1536)
    )
      throw new Error("support_ai_embedding_dimension_invalid");
    return ordered.map((item) => item.embedding);
  }
}

export class KnowledgeRetriever {
  constructor(
    private readonly search: KnowledgeSearchPort,
    private readonly embeddings?: KnowledgeEmbeddingPort,
    private readonly minimumScore = 0.08,
  ) {}

  async retrieve(input: {
    workspaceId: string;
    query: string;
    limit?: number;
  }) {
    const query = input.query.trim();
    if (!query)
      return {
        chunks: [],
        sufficient: false,
        indexVersion: null as string | null,
      };
    const queryEmbedding = await this.embeddings?.embed(query);
    const rows = await this.search.query({
      workspaceId: input.workspaceId,
      query,
      limit: Math.max(1, Math.min(input.limit ?? 8, 20)),
      minimumScore: this.minimumScore,
      ...(queryEmbedding ? { queryEmbedding } : {}),
    });
    const chunks = rows.map((row) => ({
      ...row,
      citation: {
        articleId: row.articleId,
        title: row.articleTitle,
        heading: row.heading,
        version: row.articleVersion,
      },
    }));
    return {
      chunks,
      sufficient: chunks.some(
        (chunk) => chunk.hybridScore >= this.minimumScore,
      ),
      indexVersion: chunks[0]?.articleVersion ?? null,
    };
  }
}
