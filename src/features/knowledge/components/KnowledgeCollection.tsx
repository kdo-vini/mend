import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, type ReactNode } from "react";
import type { KnowledgeArticle } from "../../../types";
import { StatusArticle } from "../../../shared/ui/DataDisplay";

export function KnowledgeCollection({
  articles,
  selectedId,
  onSelect,
  actionsFor,
}: {
  articles: KnowledgeArticle[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  actionsFor?: (article: KnowledgeArticle) => ReactNode;
}) {
  const { t } = useTranslation("knowledge");
  const selected = articles.find((article) => article.id === selectedId);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected && window.matchMedia("(max-width: 650px)").matches) {
      backRef.current?.focus();
    }
  }, [selected]);

  const closeMobilePreview = () => {
    const rowToRestore = selectedRowRef.current;
    onSelect(null);
    requestAnimationFrame(() => rowToRestore?.focus());
  };

  return (
    <div
      className={
        selected ? "knowledge-workspace has-selection" : "knowledge-workspace"
      }
    >
      <div className="knowledge-collection" aria-label={t("ui.articleList")}>
        {articles.map((article) => (
          <button
            className={
              article.id === selectedId
                ? "knowledge-row selected"
                : "knowledge-row"
            }
            type="button"
            key={article.id}
            ref={article.id === selectedId ? selectedRowRef : undefined}
            aria-pressed={article.id === selectedId}
            onClick={() => onSelect(article.id)}
          >
            <span className="knowledge-row-main">
              <strong>{article.title}</strong>
              <span>{article.excerpt}</span>
            </span>
            <span className="knowledge-row-state">
              <StatusArticle status={article.status} />
              <small>{article.category}</small>
              <small>{t("ui.updated", { date: article.updatedAt })}</small>
            </span>
          </button>
        ))}
      </div>
      {selected ? (
        <aside className="knowledge-preview" aria-label={t("ui.preview")}>
          <button
            ref={backRef}
            className="knowledge-mobile-back"
            type="button"
            onClick={closeMobilePreview}
          >
            <ChevronLeft size={17} /> {t("ui.backToArticles")}
          </button>
          <header>
            <StatusArticle status={selected.status} />
            <span>
              {selected.status === "Published"
                ? t("ui.availableToAi")
                : t("ui.internalDraft")}
            </span>
          </header>
          <h2>{selected.title}</h2>
          <p>{selected.excerpt}</p>
          {actionsFor ? (
            <div className="knowledge-preview-actions">
              {actionsFor(selected)}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
