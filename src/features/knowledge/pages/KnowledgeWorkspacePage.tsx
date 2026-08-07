import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { KnowledgeArticle } from "../../../types";
import {
  loadKnowledgeArticles,
  removeKnowledgeArticle,
  saveKnowledgeArticle,
} from "../api";
import { normalizeSearch } from "../../../shared/lib/format";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { EmptyState, Skeleton } from "../../../shared/ui/ResourceState";
import { StatusArticle } from "../../../shared/ui/DataDisplay";
import { Select } from "../../../shared/ui/Select";
import { localizedError } from "../../../shared/ui/localizedError";

function KnowledgeSkeletonPreview({ label }: { label: string }) {
  return (
    <div className="knowledge-list-skeleton" role="status" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div className="knowledge-skeleton-row" key={item} aria-hidden="true">
          <Skeleton className="knowledge-icon" />
          <div className="knowledge-skeleton-copy">
            <Skeleton className="knowledge-skeleton-title" />
            <Skeleton className="knowledge-skeleton-line" />
            <Skeleton className="knowledge-skeleton-meta" />
          </div>
        </div>
      ))}
    </div>
  );
}

type KnowledgeDraft = {
  id?: string;
  title: string;
  category: string;
  body: string;
  status: "draft" | "published";
};

export function KnowledgeWorkspacePage({
  workspaceId,
  onToast,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation("knowledge");
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KnowledgeDraft>({
    title: "",
    category: "Suporte",
    body: "",
    status: "draft",
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(workspaceId));

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setArticles(await loadKnowledgeArticles(workspaceId));
    } catch (error) {
      onToast(localizedError(error, t("errors.load", { ns: "knowledge" })));
    } finally {
      setLoading(false);
    }
  }, [onToast, t, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = articles.filter((article) =>
    normalizeSearch(
      `${article.title} ${article.category} ${article.excerpt}`,
    ).includes(normalizeSearch(search)),
  );

  const openNewArticle = () => {
    setEditing({ title: "", category: "Suporte", body: "", status: "draft" });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!workspaceId || !editing.title.trim() || !editing.body.trim()) return;
    try {
      const article = await saveKnowledgeArticle({
        workspaceId,
        articleId: editing.id,
        title: editing.title.trim(),
        category: editing.category.trim() || "Suporte",
        body: editing.body.trim(),
        status: editing.status,
      });
      setArticles((current) =>
        editing.id
          ? current.map((item) => (item.id === article.id ? article : item))
          : [article, ...current],
      );
      setEditorOpen(false);
      setEditing({ title: "", category: "Suporte", body: "", status: "draft" });
      onToast(
        editing.id
          ? t("toasts.updated", { ns: "knowledge" })
          : editing.status === "published"
            ? t("toasts.published", { ns: "knowledge" })
            : t("toasts.savedDraft", { ns: "knowledge" }),
      );
    } catch (error) {
      onToast(localizedError(error, t("errors.save", { ns: "knowledge" })));
    }
  };

  const remove = async (id: string) => {
    if (!workspaceId) return;
    try {
      await removeKnowledgeArticle(workspaceId, id);
      setArticles((current) => current.filter((item) => item.id !== id));
      onToast(t("toasts.deleted", { ns: "knowledge" }));
    } catch (error) {
      onToast(localizedError(error, t("errors.delete", { ns: "knowledge" })));
    }
  };

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
            disabled={!workspaceId}
            onClick={openNewArticle}
          >
            <Plus size={15} /> {t("create")}
          </button>
        }
      />
      {!workspaceId && (
        <div className="settings-section">
          <EmptyState
            title={t("ui.connectWorkspace")}
            description={t("ui.connectWorkspaceDescription")}
          />
        </div>
      )}
      {workspaceId && (
        <>
          <div className="knowledge-toolbar">
            <label className="search-field">
              <Search size={15} />
              <input
                data-global-search
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("ui.search")}
                aria-label={t("ui.search")}
              />
            </label>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={14} />{" "}
              {loading ? t("ui.loading") : t("ui.refresh")}
            </button>
          </div>
          <div className="knowledge-list">
            {loading ? (
              <KnowledgeSkeletonPreview label={t("ui.loading")} />
            ) : filtered.length ? (
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
                      <span>
                        {t("ui.updated", { date: article.updatedAt })}
                      </span>
                    </div>
                  </div>
                  <ActionMenu label={article.title}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEditing({
                          id: article.id,
                          title: article.title,
                          category: article.category,
                          body: article.excerpt,
                          status:
                            article.status === "Published"
                              ? "published"
                              : "draft",
                        });
                        setEditorOpen(true);
                      }}
                    >
                      <PenLine size={14} /> {t("ui.edit")}
                    </button>
                    <button
                      className="danger"
                      type="button"
                      role="menuitem"
                      onClick={() => void remove(article.id)}
                    >
                      <Trash2 size={14} /> {t("ui.delete")}
                    </button>
                  </ActionMenu>
                </article>
              ))
            ) : (
              <EmptyState
                title={t("ui.noArticles")}
                description={t("ui.createReviewedAnswer")}
                action={
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={!workspaceId}
                    onClick={openNewArticle}
                  >
                    <Plus size={13} /> {t("create")}
                  </button>
                }
              />
            )}
          </div>
          <div className="knowledge-note">
            <ShieldCheck size={15} />
            <span>{t("ui.publishedOnly")}</span>
          </div>
        </>
      )}
      {editorOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">
                  {t("ui.workspaceKnowledge")}
                </span>
                <h2 id="article-editor-title">
                  {editing.id ? t("ui.edit") : t("create")}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label={t("ui.closeEditor")}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                {t("editor.title")}
                <input
                  autoFocus
                  value={editing.title}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder={t("editor.titlePlaceholder")}
                />
              </label>
              <label>
                {t("editor.category")}
                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder={t("editor.categoryPlaceholder")}
                />
              </label>
              <label>
                {t("editor.body")}
                <textarea
                  rows={10}
                  value={editing.body}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  placeholder={t("editor.bodyPlaceholder")}
                />
              </label>
              <label>
                {t("editor.status")}
                <Select
                  value={editing.status}
                  options={[
                    { value: "draft", label: t("editor.draft") },
                    { value: "published", label: t("editor.published") },
                  ]}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      status: value as KnowledgeDraft["status"],
                    }))
                  }
                />
              </label>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setEditorOpen(false)}
              >
                {t("actions.cancel", { ns: "common" })}
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  !workspaceId || !editing.title.trim() || !editing.body.trim()
                }
                onClick={() => void save()}
              >
                <Save size={14} /> {t("editor.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
