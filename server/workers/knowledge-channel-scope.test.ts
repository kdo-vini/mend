import { describe, expect, it, vi } from "vitest";
import { SupabaseLiveWorkerKnowledge } from "./knowledge.js";

const DIAGIUM = "22222222-2222-4222-8222-222222222222";

function chunk(id: string, extra: Record<string, unknown>) {
  return {
    chunk_id: `chunk-${id}`,
    article_id: id,
    article_title: id,
    content: "conteúdo",
    article_version: "1",
    hybrid_score: 0.5,
    ...extra,
  };
}

function fakeClient(chunks: unknown[]) {
  const tables: string[] = [];
  const query: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "order", "limit"])
    query[op] = () => query;
  query.then = (resolve: (value: unknown) => void) =>
    resolve({
      data: [{ id: "fallback", title: "Zelo", category: "c", body: "b" }],
      error: null,
    });
  const client = {
    from: (table: string) => {
      tables.push(table);
      return query;
    },
    rpc: vi.fn(async () => ({ data: chunks, error: null })),
  };
  return { client, tables };
}

describe("SupabaseLiveWorkerKnowledge channel scope", () => {
  const scope = { allowedProductIds: [DIAGIUM], strictProducts: true };

  it("drops shared unmapped articles on a product-scoped channel", async () => {
    const { client } = fakeClient([
      chunk("shared-zelo", { source_kind: "manual", product_ids: [] }),
      chunk("diagium", { source_kind: "manual", product_ids: [DIAGIUM] }),
      chunk("diagium-repo", { source_kind: "repository", product_ids: [] }),
    ]);
    const knowledge = new SupabaseLiveWorkerKnowledge(client as never);
    const articles = await knowledge.listPublished(
      "ws-1",
      "nota fiscal",
      [DIAGIUM],
      undefined,
      scope,
    );
    expect(articles.map((article) => article.id)).toEqual([
      "diagium",
      "diagium-repo",
    ]);
  });

  it("never falls back to the whole workspace on a scoped channel", async () => {
    const { client, tables } = fakeClient([]);
    const knowledge = new SupabaseLiveWorkerKnowledge(client as never);
    await expect(
      knowledge.listPublished("ws-1", "oi", [DIAGIUM], undefined, scope),
    ).resolves.toEqual([]);
    await expect(
      knowledge.listPublished("ws-1", "", [DIAGIUM], undefined, scope),
    ).resolves.toEqual([]);
    await expect(
      knowledge.listPublished("ws-1", "oi", [], undefined, scope),
    ).resolves.toEqual([]);
    expect(tables).not.toContain("knowledge_articles");
  });

  it("keeps the workspace fallback for legacy channels", async () => {
    const { client } = fakeClient([]);
    const knowledge = new SupabaseLiveWorkerKnowledge(client as never);
    const articles = await knowledge.listPublished("ws-1", "oi", []);
    expect(articles.map((article) => article.id)).toEqual(["fallback"]);
  });

  it("resolves no product when the channel allows none", async () => {
    const { client, tables } = fakeClient([]);
    const knowledge = new SupabaseLiveWorkerKnowledge(client as never);
    await expect(
      knowledge.resolveProducts("ws-1", "conv-1", "msg-1", "ZeloPDV", {
        allowedProductIds: [],
        strictProducts: true,
      }),
    ).resolves.toMatchObject({ productIds: [] });
    expect(tables).toEqual([]);
  });
});
