import {
  createLiveKnowledge,
  deleteLiveKnowledge,
  updateLiveKnowledge,
} from "../../api/live-actions";
import { toUiKnowledge } from "../../api/live-mappers";
import type { KnowledgeArticle } from "../../types";
import type { KnowledgeProduct, KnowledgeSourceSummary } from "../../types";
import { supabase } from "../../lib/supabase";
import { apiRequest } from "../../api/transport";
import {
  listLiveRepositories,
  type LiveRepository,
} from "../../api/live-actions";

export type { LiveRepository };

function requireClient() {
  if (!supabase) throw new Error("Live workspace is not configured.");
  return supabase;
}

export async function loadKnowledgeArticles(
  workspaceId: string,
): Promise<KnowledgeArticle[]> {
  const response = await apiRequest<{ data: unknown[] }>(
    "/api/knowledge?limit=200&managedBySync=false",
    {},
    workspaceId,
  );
  return (response.data ?? []).map((article) =>
    toUiKnowledge(article as never),
  );
}

export async function saveKnowledgeArticle(input: {
  workspaceId: string;
  articleId?: string;
  title: string;
  category: string;
  body: string;
  status: "draft" | "published";
  productIds?: string[];
}) {
  const client = requireClient();
  const row = input.articleId
    ? await updateLiveKnowledge(
        {
          workspaceId: input.workspaceId,
          articleId: input.articleId,
          patch: {
            title: input.title,
            category: input.category,
            body: input.body,
            status: input.status,
            productIds: input.productIds ?? [],
          },
        },
        client,
      )
    : await createLiveKnowledge(
        {
          workspaceId: input.workspaceId,
          title: input.title,
          category: input.category,
          body: input.body,
          status: input.status,
          productIds: input.productIds ?? [],
        },
        client,
      );
  return toUiKnowledge(row as never);
}

export async function loadKnowledgeConfiguration(workspaceId: string): Promise<{
  products: KnowledgeProduct[];
  sources: KnowledgeSourceSummary[];
  repositories: LiveRepository[];
}> {
  const [products, sources, repositories] = await Promise.all([
    apiRequest<{ data: KnowledgeProduct[] }>(
      "/api/knowledge/products",
      {},
      workspaceId,
    ),
    loadKnowledgeSources(workspaceId),
    listLiveRepositories(workspaceId),
  ]);
  return {
    products: products.data ?? [],
    sources,
    repositories,
  };
}

export async function loadKnowledgeSources(
  workspaceId: string,
): Promise<KnowledgeSourceSummary[]> {
  const response = await apiRequest<{ data: KnowledgeSourceSummary[] }>(
    "/api/knowledge/sources",
    {},
    workspaceId,
  );
  return response.data ?? [];
}

export async function saveKnowledgeProduct(
  workspaceId: string,
  input: Omit<KnowledgeProduct, "id" | "status"> & {
    id?: string;
    status?: KnowledgeProduct["status"];
  },
) {
  return apiRequest<KnowledgeProduct>(
    input.id
      ? `/api/knowledge/products/${encodeURIComponent(input.id)}`
      : "/api/knowledge/products",
    {
      method: input.id ? "PATCH" : "POST",
      body: JSON.stringify({
        key: input.key,
        name: input.name,
        description: input.description,
        aliases: input.aliases,
        status: input.status ?? "active",
      }),
    },
    workspaceId,
  );
}

export async function createKnowledgeSource(
  workspaceId: string,
  input: { repositoryId: string; productIds: string[]; refName: string },
) {
  return apiRequest<KnowledgeSourceSummary>(
    "/api/knowledge/sources",
    { method: "POST", body: JSON.stringify({ ...input, syncMode: "event" }) },
    workspaceId,
  );
}

export async function requestKnowledgeSync(
  workspaceId: string,
  sourceId: string,
) {
  return apiRequest<{ queued: boolean; requestedSha: string }>(
    `/api/knowledge/sources/${encodeURIComponent(sourceId)}/sync`,
    { method: "POST", body: "{}" },
    workspaceId,
  );
}

export async function activateKnowledgeRevision(
  workspaceId: string,
  sourceId: string,
  sha: string,
) {
  return apiRequest<KnowledgeSourceSummary>(
    `/api/knowledge/sources/${encodeURIComponent(sourceId)}/activate`,
    { method: "POST", body: JSON.stringify({ sha }) },
    workspaceId,
  );
}

export async function removeKnowledgeArticle(
  workspaceId: string,
  articleId: string,
) {
  await deleteLiveKnowledge({ workspaceId, articleId }, requireClient());
}
