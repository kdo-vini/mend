import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronRight,
  ListFilter,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { KnowledgeArticle } from "../../../types";
import { seedKnowledge } from "../../../data";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { StatusArticle } from "../../../shared/ui/DataDisplay";
import { Select } from "../../../shared/ui/Select";

export function KnowledgePage() {
  const { t } = useTranslation("knowledge");
  const [articles, setArticles] = useState<KnowledgeArticle[]>(seedKnowledge);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const categories = [
    "All",
    ...new Set(articles.map((article) => article.category)),
  ];
  const filtered = articles.filter(
    (article) =>
      normalizeSearch(
        `${article.title} ${article.category} ${article.excerpt}`,
      ).includes(normalizeSearch(search)) &&
      (categoryFilter === "All" || article.category === categoryFilter),
  );
  const addArticle = () =>
    setArticles((current) => [
      {
        id: `kb-${Date.now()}`,
        title: "Untitled knowledge article",
        category: "Support",
        updatedAt: "Just now",
        excerpt: "Add the operational answer your team wants to reuse.",
        status: "Draft",
      },
      ...current,
    ]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("ui.eyebrow")}
        title={t("title")}
        description={t("ui.description")}
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={addArticle}
          >
            <Plus size={15} /> {t("create")}
          </button>
        }
      />
      <div className="knowledge-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            ref={searchRef}
            data-global-search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("ui.search")}
            aria-label={t("ui.search")}
          />
        </label>
        <div className="select-control">
          <ListFilter size={14} />
          <Select
            ariaLabel={t("ui.filterCategory")}
            value={categoryFilter}
            options={categories.map((category) => ({
              value: category,
              label: category === "All" ? t("ui.allCategories") : category,
            }))}
            onChange={setCategoryFilter}
          />
        </div>
      </div>
      <div className="knowledge-list">
        {filtered.length ? (
          filtered.map((article) => (
            <article className="knowledge-row" key={article.id}>
              <div className="knowledge-icon">
                <BookOpen size={17} />
              </div>
              <div className="knowledge-copy">
                <div className="knowledge-row-title">
                  <h3>{article.title}</h3>
                  <StatusArticle status={article.status} />
                </div>
                <p>{article.excerpt}</p>
                <div className="knowledge-meta">
                  <span>{article.category}</span>
                  <span>Updated {article.updatedAt}</span>
                </div>
              </div>
              <ChevronRight size={17} />
            </article>
          ))
        ) : (
          <EmptyState
            title={articles.length ? t("ui.noMatching") : t("empty")}
            description={
              articles.length ? t("ui.tryDifferent") : t("ui.createAnswer")
            }
            action={
              articles.length ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter("All");
                  }}
                >
                  {t("ui.clearFilters")}
                </button>
              ) : (
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={addArticle}
                >
                  <Plus size={13} /> {t("create")}
                </button>
              )
            }
            search={Boolean(search)}
          />
        )}
      </div>
      <div className="knowledge-note">
        <ShieldCheck size={15} />
        <span>
          AI only uses published articles from this workspace. Drafts stay
          internal.
        </span>
      </div>
    </div>
  );
}
