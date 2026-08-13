import type { KnowledgeArticle } from "../../types";
import { normalizeSearch } from "../../shared/lib/format";

export function filterKnowledgeArticles(
  articles: KnowledgeArticle[],
  search: string,
  category = "All",
) {
  const normalizedSearch = normalizeSearch(search);
  return articles.filter(
    (article) =>
      normalizeSearch(
        `${article.title} ${article.category} ${article.excerpt}`,
      ).includes(normalizedSearch) &&
      (category === "All" || article.category === category),
  );
}

export function reconcileKnowledgeSelection(
  visibleArticles: KnowledgeArticle[],
  selectedId: string | null,
) {
  if (!selectedId) {
    return null;
  }

  return visibleArticles.some((article) => article.id === selectedId)
    ? selectedId
    : (visibleArticles[0]?.id ?? null);
}
