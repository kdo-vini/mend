import {
  createLiveKnowledge,
  deleteLiveKnowledge,
  loadLiveWorkspace,
  updateLiveKnowledge,
} from "../../api/live-actions";
import { toUiKnowledge } from "../../api/live-mappers";
import type { KnowledgeArticle } from "../../types";
import { supabase } from "../../lib/supabase";

function requireClient() {
  if (!supabase) throw new Error("Live workspace is not configured.");
  return supabase;
}

export async function loadKnowledgeArticles(
  workspaceId: string,
): Promise<KnowledgeArticle[]> {
  return (await loadLiveWorkspace(requireClient(), workspaceId)).knowledge;
}

export async function saveKnowledgeArticle(input: {
  workspaceId: string;
  articleId?: string;
  title: string;
  category: string;
  body: string;
  status: "draft" | "published";
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
        },
        client,
      );
  return toUiKnowledge(row as never);
}

export async function removeKnowledgeArticle(
  workspaceId: string,
  articleId: string,
) {
  await deleteLiveKnowledge({ workspaceId, articleId }, requireClient());
}
