import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type {
  KnowledgeArticle,
  KnowledgeProduct,
  KnowledgeSourceSummary,
} from "../../../types";
import {
  activateKnowledgeRevision,
  configureKnowledgeRepository,
  createKnowledgeSource,
  loadKnowledgeArticles,
  loadKnowledgeConfiguration,
  loadKnowledgeSources,
  removeKnowledgeArticle,
  removeKnowledgeSource,
  requestKnowledgeSync,
  saveKnowledgeArticle,
  saveKnowledgeProduct,
  updateKnowledgeSourceProducts,
  type LiveRepository,
} from "../api";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { EmptyState, Skeleton } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import { localizedError } from "../../../shared/ui/localizedError";
import { KnowledgeCollection } from "../components/KnowledgeCollection";
import { KnowledgeProductBar } from "../components/KnowledgeProductBar";
import { KnowledgeProductDialog } from "../components/KnowledgeProductDialog";
import { KnowledgeSourcesPanel } from "../components/KnowledgeSourcesPanel";
import { useConfirmation } from "../../../shared/ui/useConfirmation";
import {
  filterKnowledgeArticles,
  reconcileKnowledgeSelection,
} from "../knowledge-selection";

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
  productIds: string[];
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
  const [products, setProducts] = useState<KnowledgeProduct[]>([]);
  const [sources, setSources] = useState<KnowledgeSourceSummary[]>([]);
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
  const [githubRepositories, setGithubRepositories] = useState<
    Array<{ owner: string; repo: string; defaultBranch: string }>
  >([]);
  const [selectedProductId, setSelectedProductId] = useState("all");
  const [view, setView] = useState<"content" | "sources">("content");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [configurationBusy, setConfigurationBusy] = useState(false);
  const [pendingSyncIds, setPendingSyncIds] = useState<string[]>([]);
  const { confirm, confirmationDialog } = useConfirmation();
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KnowledgeDraft>({
    title: "",
    category: "Suporte",
    body: "",
    status: "draft",
    productIds: [],
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const newArticleRef = useRef<HTMLButtonElement>(null);
  const clearSearchRef = useRef<HTMLButtonElement>(null);
  const pendingDeleteFocusRef = useRef<"clear" | "new" | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextArticles, configuration] = await Promise.all([
        loadKnowledgeArticles(workspaceId),
        loadKnowledgeConfiguration(workspaceId),
      ]);
      setArticles(nextArticles.filter((article) => !article.managedBySync));
      setProducts(configuration.products);
      setSources(configuration.sources);
      setRepositories(configuration.repositories);
      setGithubRepositories(configuration.githubRepositories);
      setPendingSyncIds(
        configuration.sources
          .filter(
            (source) =>
              source.syncState === "queued" || source.syncState === "running",
          )
          .map((source) => source.id),
      );
    } catch (error) {
      onToast(localizedError(error, t("errors.load", { ns: "knowledge" })));
    } finally {
      setLoading(false);
    }
  }, [onToast, t, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!workspaceId || !pendingSyncIds.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const nextSources = await loadKnowledgeSources(workspaceId);
        if (cancelled) return;
        setSources(nextSources);

        const pending = new Set(pendingSyncIds);
        const tracked = nextSources.filter((source) => pending.has(source.id));
        const stillRunning = tracked
          .filter(
            (source) =>
              source.syncState === "queued" || source.syncState === "running",
          )
          .map((source) => source.id);
        const completed = tracked.filter(
          (source) =>
            source.syncState !== "queued" && source.syncState !== "running",
        );
        if (completed.some((source) => source.syncState === "failed"))
          onToast(t("toasts.syncFailed"));
        else if (completed.length) onToast(t("toasts.syncCompleted"));
        setPendingSyncIds((current) =>
          current.length === stillRunning.length &&
          current.every((id, index) => id === stillRunning[index])
            ? current
            : stillRunning,
        );
        if (stillRunning.length) timer = setTimeout(() => void poll(), 2_500);
      } catch {
        if (!cancelled) timer = setTimeout(() => void poll(), 5_000);
      }
    };

    timer = setTimeout(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onToast, pendingSyncIds, t, workspaceId]);

  const scopedArticles = articles.filter((article) =>
    selectedProductId === "all"
      ? true
      : selectedProductId === "shared"
        ? !article.productIds?.length
        : article.productIds?.includes(selectedProductId),
  );
  const filtered = filterKnowledgeArticles(scopedArticles, search);

  useEffect(() => {
    const destination = pendingDeleteFocusRef.current;
    if (!destination) return;

    const target =
      destination === "clear" ? clearSearchRef.current : newArticleRef.current;
    if (target) {
      target.focus();
      pendingDeleteFocusRef.current = null;
    }
  }, [articles.length, filtered.length]);

  const updateSearch = (nextSearch: string) => {
    setSearch(nextSearch);
    const visible = filterKnowledgeArticles(articles, nextSearch);
    setSelectedArticleId((current) =>
      reconcileKnowledgeSelection(visible, current),
    );
  };

  const openNewArticle = () => {
    setEditing({
      title: "",
      category: "Suporte",
      body: "",
      status: "draft",
      productIds:
        selectedProductId !== "all" && selectedProductId !== "shared"
          ? [selectedProductId]
          : [],
    });
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
        productIds: editing.productIds,
      });
      setArticles((current) =>
        editing.id
          ? current.map((item) => (item.id === article.id ? article : item))
          : [article, ...current],
      );
      setSearch("");
      setSelectedArticleId(article.id);
      setEditorOpen(false);
      setEditing({
        title: "",
        category: "Suporte",
        body: "",
        status: "draft",
        productIds: [],
      });
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
      const remaining = articles.filter((item) => item.id !== id);
      const visibleRemaining = filterKnowledgeArticles(remaining, search);
      setArticles(remaining);
      if (selectedArticleId === id) {
        setSelectedArticleId(visibleRemaining[0]?.id ?? null);
        if (
          !visibleRemaining.length &&
          window.matchMedia("(max-width: 650px)").matches
        ) {
          pendingDeleteFocusRef.current = remaining.length ? "clear" : "new";
        }
      }
      onToast(t("toasts.deleted", { ns: "knowledge" }));
    } catch (error) {
      onToast(localizedError(error, t("errors.delete", { ns: "knowledge" })));
    }
  };

  return (
    <div className="page knowledge-page">
      <PageHeader
        eyebrow={t("ui.eyebrow")}
        title={t("title")}
        description={t("ui.description")}
        actions={
          <button
            ref={newArticleRef}
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
          <KnowledgeProductBar
            products={products}
            selectedProductId={selectedProductId}
            view={view}
            onProductChange={setSelectedProductId}
            onViewChange={(nextView) => {
              setView(nextView);
              if (nextView === "sources" && selectedProductId === "shared")
                setSelectedProductId("all");
            }}
            onCreateProduct={() => setProductDialogOpen(true)}
          />
          {view === "sources" ? (
            <KnowledgeSourcesPanel
              products={products}
              repositories={repositories}
              githubRepositories={githubRepositories}
              sources={sources}
              selectedProductId={selectedProductId}
              busy={configurationBusy}
              confirm={confirm}
              onCreate={async (input) => {
                setConfigurationBusy(true);
                try {
                  let repositoryId = input.repositoryId;
                  if (!repositoryId) {
                    const repository = await configureKnowledgeRepository(
                      workspaceId,
                      {
                        owner: input.githubOwner,
                        repo: input.githubRepo,
                        defaultBranch: input.refName,
                      },
                    );
                    repositoryId = repository.id;
                    setRepositories((current) => [repository, ...current]);
                  }
                  const existing = sources.find(
                    (source) => source.repositoryId === repositoryId,
                  );
                  const source = existing
                    ? await updateKnowledgeSourceProducts(
                        workspaceId,
                        existing,
                        [...new Set([...existing.productIds, input.productId])],
                      )
                    : await createKnowledgeSource(workspaceId, {
                        repositoryId,
                        productIds: [input.productId],
                        refName: input.refName,
                      });
                  setSources((current) =>
                    existing
                      ? current.map((item) =>
                          item.id === source.id ? source : item,
                        )
                      : [...current, source],
                  );
                  onToast(t("toasts.sourceConnected"));
                  return true;
                } catch (error) {
                  onToast(localizedError(error, t("errors.source")));
                  return false;
                } finally {
                  setConfigurationBusy(false);
                }
              }}
              onSync={async (sourceId) => {
                setConfigurationBusy(true);
                setSources((current) =>
                  current.map((source) =>
                    source.id === sourceId
                      ? { ...source, syncState: "queued" }
                      : source,
                  ),
                );
                setPendingSyncIds((current) => [
                  ...new Set([...current, sourceId]),
                ]);
                try {
                  const result = await requestKnowledgeSync(
                    workspaceId,
                    sourceId,
                  );
                  if (result.queued) {
                    onToast(t("toasts.syncQueued"));
                  } else {
                    const configuration =
                      await loadKnowledgeConfiguration(workspaceId);
                    setProducts(configuration.products);
                    setSources(configuration.sources);
                    setRepositories(configuration.repositories);
                    setGithubRepositories(configuration.githubRepositories);
                    setPendingSyncIds((current) =>
                      current.filter((id) => id !== sourceId),
                    );
                    onToast(t("toasts.syncCurrent"));
                  }
                } catch (error) {
                  setPendingSyncIds((current) =>
                    current.filter((id) => id !== sourceId),
                  );
                  void loadKnowledgeSources(workspaceId)
                    .then(setSources)
                    .catch(() => undefined);
                  onToast(localizedError(error, t("errors.sync")));
                } finally {
                  setConfigurationBusy(false);
                }
              }}
              onActivate={async (sourceId, sha) => {
                setConfigurationBusy(true);
                try {
                  const source = await activateKnowledgeRevision(
                    workspaceId,
                    sourceId,
                    sha,
                  );
                  setSources((current) =>
                    current.map((item) =>
                      item.id === source.id ? source : item,
                    ),
                  );
                  onToast(t("toasts.revisionActivated"));
                } catch (error) {
                  onToast(localizedError(error, t("errors.activate")));
                } finally {
                  setConfigurationBusy(false);
                }
              }}
              onRemove={async (sourceId) => {
                setConfigurationBusy(true);
                try {
                  await removeKnowledgeSource(workspaceId, sourceId);
                  setSources((current) =>
                    current.filter((source) => source.id !== sourceId),
                  );
                  setPendingSyncIds((current) =>
                    current.filter((id) => id !== sourceId),
                  );
                  onToast(t("toasts.sourceRemoved"));
                } catch (error) {
                  onToast(localizedError(error, t("errors.removeSource")));
                } finally {
                  setConfigurationBusy(false);
                }
              }}
            />
          ) : (
            <>
              <div className="knowledge-toolbar">
                <label className="search-field">
                  <Search size={15} />
                  <input
                    data-global-search
                    value={search}
                    onChange={(event) => updateSearch(event.target.value)}
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
              {loading ? (
                <div className="knowledge-collection">
                  <KnowledgeSkeletonPreview label={t("ui.loading")} />
                </div>
              ) : filtered.length ? (
                <KnowledgeCollection
                  articles={filtered}
                  selectedId={selectedArticleId}
                  onSelect={setSelectedArticleId}
                  actionsFor={(article) =>
                    article.managedBySync ? null : (
                      <>
                        <button
                          className="button button-ghost"
                          type="button"
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
                              productIds: article.productIds ?? [],
                            });
                            setEditorOpen(true);
                          }}
                        >
                          <PenLine size={14} /> {t("ui.edit")}
                        </button>
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => void remove(article.id)}
                        >
                          <Trash2 size={14} /> {t("ui.delete")}
                        </button>
                      </>
                    )
                  }
                />
              ) : (
                <div className="knowledge-collection knowledge-collection-empty">
                  <EmptyState
                    title={
                      articles.length ? t("ui.noMatching") : t("ui.noArticles")
                    }
                    description={
                      articles.length
                        ? t("ui.tryDifferent")
                        : t("ui.createReviewedAnswer")
                    }
                    action={
                      articles.length ? (
                        <button
                          ref={clearSearchRef}
                          className="text-button"
                          type="button"
                          onClick={() => {
                            updateSearch("");
                            setSelectedArticleId(null);
                          }}
                        >
                          {t("ui.clearFilters")}
                        </button>
                      ) : (
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={!workspaceId}
                          onClick={openNewArticle}
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
            </>
          )}
        </>
      )}
      {productDialogOpen && workspaceId ? (
        <KnowledgeProductDialog
          onClose={() => setProductDialogOpen(false)}
          onSave={async (input) => {
            try {
              const product = await saveKnowledgeProduct(workspaceId, input);
              setProducts((current) => [...current, product]);
              setSelectedProductId(product.id);
              setProductDialogOpen(false);
              onToast(t("toasts.productCreated"));
            } catch (error) {
              onToast(localizedError(error, t("errors.product")));
            }
          }}
        />
      ) : null}
      {confirmationDialog}
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
              <fieldset className="knowledge-editor-products">
                <legend>{t("editor.products")}</legend>
                <p>{t("editor.productsDescription")}</p>
                <div className="knowledge-product-checks">
                  {products
                    .filter((product) => product.status === "active")
                    .map((product) => (
                      <label key={product.id}>
                        <input
                          type="checkbox"
                          checked={editing.productIds.includes(product.id)}
                          onChange={() =>
                            setEditing((current) => ({
                              ...current,
                              productIds: current.productIds.includes(
                                product.id,
                              )
                                ? current.productIds.filter(
                                    (id) => id !== product.id,
                                  )
                                : [...current.productIds, product.id],
                            }))
                          }
                        />
                        {product.name}
                      </label>
                    ))}
                </div>
              </fieldset>
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
