import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListFilter, Plus, Search, ShieldCheck } from "lucide-react";
import type { KnowledgeArticle } from "../../../types";
import { seedKnowledge } from "../../../data";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { Select } from "../../../shared/ui/Select";
import { KnowledgeCollection } from "../components/KnowledgeCollection";

export function KnowledgePage() {
  const { t } = useTranslation("knowledge");
  const [articles, setArticles] = useState<KnowledgeArticle[]>(seedKnowledge);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null,
  );
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
  const addArticle = () => {
    const id = `kb-${Date.now()}`;
    setArticles((current) => [
      {
        id,
        title: "Novo artigo de conhecimento",
        category: "Suporte",
        updatedAt: "agora",
        excerpt:
          "Adicione a resposta operacional que sua equipe quer reutilizar.",
        status: "Draft",
      },
      ...current,
    ]);
    setSelectedArticleId(id);
  };

  return (
    <div className="page knowledge-page">
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
      {filtered.length ? (
        <KnowledgeCollection
          articles={filtered}
          selectedId={selectedArticleId}
          onSelect={setSelectedArticleId}
        />
      ) : (
        <div className="knowledge-collection knowledge-collection-empty">
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
        </div>
      )}
      <div className="knowledge-note">
        <ShieldCheck size={15} />
        <span>{t("ui.publishedOnly")}</span>
      </div>
    </div>
  );
}
