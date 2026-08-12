import { describe, expect, it } from "vitest";
import {
  chunkPublishedArticle,
  KnowledgeRetriever,
  type KnowledgeSearchPort,
} from "./knowledge-retrieval.js";

describe("tenant-scoped hybrid knowledge retrieval", () => {
  it("creates stable semantic chunks at headings and paragraph boundaries", () => {
    const article = {
      id: "article-1",
      workspaceId: "workspace-1",
      title: "Refund policy",
      status: "published" as const,
      body: "# Eligibility\n\nRefunds are available for duplicate charges.\n\n# Timing\n\nRequests are reviewed within five business days.",
      updatedAt: "2026-08-12T12:00:00.000Z",
    };
    const first = chunkPublishedArticle(article, { maxCharacters: 70 });
    const second = chunkPublishedArticle(article, { maxCharacters: 70 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first[0]).toMatchObject({
      articleId: "article-1",
      workspaceId: "workspace-1",
      heading: "Eligibility",
      index: 0,
    });
    expect(first.every((chunk) => chunk.content.length <= 70)).toBe(true);
  });

  it("never indexes a draft article", () => {
    expect(
      chunkPublishedArticle({
        id: "article-1",
        workspaceId: "workspace-1",
        title: "Draft",
        status: "draft",
        body: "Secret draft content",
        updatedAt: "2026-08-12T12:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("passes the tenant filter and returns cited hybrid results", async () => {
    const search: KnowledgeSearchPort = {
      query: async (input) => {
        expect(input.workspaceId).toBe("workspace-1");
        return [
          {
            chunkId: "chunk-1",
            articleId: "article-1",
            articleTitle: "Refund policy",
            heading: "Eligibility",
            content: "Duplicate charges qualify.",
            lexicalScore: 0.3,
            semanticScore: 0.8,
            hybridScore: 0.575,
            articleVersion: "version-1",
          },
        ];
      },
    };
    const result = await new KnowledgeRetriever(search).retrieve({
      workspaceId: "workspace-1",
      query: "I was charged twice",
      limit: 5,
    });

    expect(result.sufficient).toBe(true);
    expect(result.chunks[0]?.citation).toEqual({
      articleId: "article-1",
      title: "Refund policy",
      heading: "Eligibility",
      version: "version-1",
    });
  });

  it("marks weak evidence as insufficient", async () => {
    const search: KnowledgeSearchPort = {
      query: async () => [],
    };
    await expect(
      new KnowledgeRetriever(search).retrieve({
        workspaceId: "workspace-1",
        query: "unknown",
      }),
    ).resolves.toMatchObject({ sufficient: false, chunks: [] });
  });
});
