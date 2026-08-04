import { useCallback, useEffect, useState } from "react";
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

function KnowledgeSkeletonPreview() {
  return (
    <div
      className="knowledge-list-skeleton"
      role="status"
      aria-label="Loading knowledge"
    >
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
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KnowledgeDraft>({
    title: "",
    category: "Support",
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
      onToast(
        error instanceof Error
          ? error.message
          : "Knowledge could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [onToast, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = articles.filter((article) =>
    normalizeSearch(
      `${article.title} ${article.category} ${article.excerpt}`,
    ).includes(normalizeSearch(search)),
  );

  const openNewArticle = () => {
    setEditing({ title: "", category: "Support", body: "", status: "draft" });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!workspaceId || !editing.title.trim() || !editing.body.trim()) return;
    try {
      const article = await saveKnowledgeArticle({
        workspaceId,
        articleId: editing.id,
        title: editing.title.trim(),
        category: editing.category.trim() || "Support",
        body: editing.body.trim(),
        status: editing.status,
      });
      setArticles((current) =>
        editing.id
          ? current.map((item) => (item.id === article.id ? article : item))
          : [article, ...current],
      );
      setEditorOpen(false);
      setEditing({ title: "", category: "Support", body: "", status: "draft" });
      onToast(
        editing.id
          ? "Article updated"
          : editing.status === "published"
            ? "Article published for AI"
            : "Article saved as draft",
      );
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Article could not be saved.",
      );
    }
  };

  const remove = async (id: string) => {
    if (!workspaceId) return;
    try {
      await removeKnowledgeArticle(workspaceId, id);
      setArticles((current) => current.filter((item) => item.id !== id));
      onToast("Article deleted");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Article could not be deleted.",
      );
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Support context"
        title="Knowledge"
        description="Write the trusted articles Mend can use before drafting a WhatsApp reply."
        actions={
          <button
            className="button button-primary"
            type="button"
            disabled={!workspaceId}
            onClick={openNewArticle}
          >
            <Plus size={15} /> New article
          </button>
        }
      />
      {!workspaceId && (
        <div className="settings-section">
          <EmptyState
            title="Connect a workspace first"
            description="Knowledge is scoped to an authenticated Mend workspace. No demo articles are shown."
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
                placeholder="Search your articles"
                aria-label="Search knowledge"
              />
            </label>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div className="knowledge-list">
            {loading ? (
              <KnowledgeSkeletonPreview />
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
                      <span>Updated {article.updatedAt}</span>
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
                      <PenLine size={14} /> Edit article
                    </button>
                    <button
                      className="danger"
                      type="button"
                      role="menuitem"
                      onClick={() => void remove(article.id)}
                    >
                      <Trash2 size={14} /> Delete article
                    </button>
                  </ActionMenu>
                </article>
              ))
            ) : (
              <EmptyState
                title="No knowledge articles yet"
                description="Create the first reviewed answer about your systems, products and support procedures."
                action={
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={!workspaceId}
                    onClick={openNewArticle}
                  >
                    <Plus size={13} /> New article
                  </button>
                }
              />
            )}
          </div>
          <div className="knowledge-note">
            <ShieldCheck size={15} />
            <span>
              Only published articles from this workspace are eligible for AI
              context. Drafts stay internal.
            </span>
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
                <span className="page-kicker">Workspace knowledge</span>
                <h2 id="article-editor-title">
                  {editing.id ? "Edit article" : "New article"}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close article editor"
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Title
                <input
                  autoFocus
                  value={editing.title}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="How our checkout works"
                />
              </label>
              <label>
                Category
                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Product"
                />
              </label>
              <label>
                Article body
                <textarea
                  rows={10}
                  value={editing.body}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  placeholder="Explain the system, the correct procedure and when to escalate."
                />
              </label>
              <label>
                Status
                <Select
                  value={editing.status}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "published", label: "Published for AI" },
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
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  !workspaceId || !editing.title.trim() || !editing.body.trim()
                }
                onClick={() => void save()}
              >
                <Save size={14} /> Save article
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
