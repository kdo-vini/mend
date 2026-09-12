import {
  CheckCircle2,
  CircleAlert,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LiveGitHubRepository, LiveRepository } from "../api";
import type { KnowledgeProduct, KnowledgeSourceSummary } from "../../../types";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { Select } from "../../../shared/ui/Select";

const shortSha = (value?: string) => value?.slice(0, 8) || "—";
const normalizedName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function repositoryMatchesProduct(
  repository: LiveGitHubRepository,
  product?: KnowledgeProduct,
) {
  if (!product) return false;
  const repositoryName = normalizedName(repository.repo);
  return [product.key, product.name, ...product.aliases]
    .map(normalizedName)
    .filter((term) => term.length >= 4)
    .some(
      (term) =>
        repositoryName.includes(term) ||
        (repositoryName.length >= 4 && term.includes(repositoryName)),
    );
}

export function KnowledgeSourcesPanel({
  products,
  repositories,
  githubRepositories,
  sources,
  selectedProductId,
  busy,
  confirm,
  onCreate,
  onSync,
  onActivate,
  onRemove,
}: {
  products: KnowledgeProduct[];
  repositories: LiveRepository[];
  githubRepositories: LiveGitHubRepository[];
  sources: KnowledgeSourceSummary[];
  selectedProductId: string;
  busy: boolean;
  confirm: Confirm;
  onCreate: (input: {
    repositoryId?: string;
    githubOwner: string;
    githubRepo: string;
    productId: string;
    refName: string;
  }) => Promise<boolean>;
  onSync: (sourceId: string) => Promise<void>;
  onActivate: (sourceId: string, sha: string) => Promise<void>;
  onRemove: (sourceId: string) => Promise<void>;
}) {
  const { t } = useTranslation("knowledge");
  const activeProducts = useMemo(
    () => products.filter((product) => product.status === "active"),
    [products],
  );
  const initialProductId = activeProducts.some(
    (product) => product.id === selectedProductId,
  )
    ? selectedProductId
    : "";
  const [productId, setProductId] = useState(initialProductId);
  const [repositoryKey, setRepositoryKey] = useState("");
  const [showAllRepositories, setShowAllRepositories] = useState(false);
  const configuredByGitHub = useMemo(
    () =>
      new Map(
        repositories
          .filter(
            (repository) => repository.githubOwner && repository.githubRepo,
          )
          .map((repository) => [
            `${repository.githubOwner!.toLowerCase()}/${repository.githubRepo!.toLowerCase()}`,
            repository,
          ]),
      ),
    [repositories],
  );
  const allRepositoryOptions = useMemo(
    () =>
      githubRepositories
        .map((repository) => {
          const key = `${repository.owner}/${repository.repo}`;
          const configured = configuredByGitHub.get(key.toLowerCase());
          const source = configured
            ? sources.find((item) => item.repositoryId === configured.id)
            : undefined;
          return { key, repository, configured, source };
        })
        .filter((option) => !option.source?.productIds.includes(productId)),
    [configuredByGitHub, githubRepositories, productId, sources],
  );
  const product = products.find((item) => item.id === productId);
  const matchingRepositoryOptions = allRepositoryOptions.filter((option) =>
    repositoryMatchesProduct(option.repository, product),
  );
  const hasSuggestedRepositories = githubRepositories.some((repository) =>
    repositoryMatchesProduct(repository, product),
  );
  const repositoryOptions = showAllRepositories
    ? allRepositoryOptions
    : matchingRepositoryOptions;
  const selectedRepository = repositoryOptions.find(
    (option) => option.key === repositoryKey,
  );
  const visibleSources =
    selectedProductId === "all"
      ? sources
      : selectedProductId === "shared"
        ? []
        : sources.filter((source) =>
            source.productIds.includes(selectedProductId),
          );

  useEffect(() => {
    if (
      selectedProductId !== "all" &&
      selectedProductId !== "shared" &&
      activeProducts.some((item) => item.id === selectedProductId)
    ) {
      setProductId(selectedProductId);
      setRepositoryKey("");
      setShowAllRepositories(false);
    }
  }, [activeProducts, selectedProductId]);

  useEffect(() => {
    if (
      repositoryKey &&
      !repositoryOptions.some((option) => option.key === repositoryKey)
    )
      setRepositoryKey("");
  }, [repositoryKey, repositoryOptions]);

  return (
    <div className="knowledge-sources">
      <section className="knowledge-source-create">
        <div>
          <h2>{t("sources.connectTitle")}</h2>
          <p>{t("sources.connectDescription")}</p>
        </div>
        <div className="knowledge-source-form">
          <label>
            {t("sources.product")}
            <Select
              value={productId}
              options={[
                {
                  value: "",
                  label: t("sources.selectProduct"),
                  disabled: true,
                },
                ...activeProducts.map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
              onChange={(value) => {
                setProductId(value);
                setRepositoryKey("");
                setShowAllRepositories(false);
              }}
            />
          </label>
          <label>
            {t("sources.githubRepository")}
            <Select
              value={repositoryKey}
              options={[
                {
                  value: "",
                  label: productId
                    ? hasSuggestedRepositories &&
                      !matchingRepositoryOptions.length
                      ? t("sources.suggestedAlreadyConnected")
                      : t("sources.selectGithubRepository")
                    : t("sources.selectProductFirst"),
                  disabled: true,
                },
                ...repositoryOptions.map((option) => ({
                  value: option.key,
                  label: option.key,
                })),
              ]}
              onChange={setRepositoryKey}
              disabled={!productId || !githubRepositories.length}
            />
          </label>
          {productId &&
          allRepositoryOptions.length > matchingRepositoryOptions.length ? (
            <button
              className="knowledge-source-show-all"
              type="button"
              onClick={() => {
                setShowAllRepositories((current) => !current);
                setRepositoryKey("");
              }}
            >
              {showAllRepositories
                ? t("sources.showSuggestedRepositories")
                : t("sources.showAllRepositories")}
            </button>
          ) : null}
          {productId &&
          !hasSuggestedRepositories &&
          !showAllRepositories &&
          githubRepositories.length ? (
            <div className="knowledge-source-guidance">
              <span>{t("sources.noSuggestedRepository")}</span>
            </div>
          ) : null}
          {!githubRepositories.length ? (
            <div className="knowledge-source-guidance">
              <span>{t("sources.noGithubRepositories")}</span>
              <Link to="/settings/integrations/github">
                {t("sources.manageGithub")}
              </Link>
            </div>
          ) : null}
          {product && selectedRepository ? (
            <div className="knowledge-source-summary" role="status">
              {t(
                selectedRepository.source
                  ? "sources.mappingSummaryExisting"
                  : "sources.mappingSummary",
                {
                  repository: selectedRepository.key,
                  product: product.name,
                },
              )}
            </div>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            disabled={busy || !productId || !selectedRepository}
            onClick={() => {
              if (!selectedRepository || !product) return;
              const connect = () =>
                onCreate({
                  ...(selectedRepository.configured
                    ? { repositoryId: selectedRepository.configured.id }
                    : {}),
                  githubOwner: selectedRepository.repository.owner,
                  githubRepo: selectedRepository.repository.repo,
                  productId,
                  refName: selectedRepository.repository.defaultBranch,
                }).then((connected) => {
                  if (connected) setRepositoryKey("");
                });
              if (
                repositoryMatchesProduct(selectedRepository.repository, product)
              ) {
                void connect();
                return;
              }
              void confirm({
                title: t("sources.confirmDifferentRepositoryTitle"),
                description: t(
                  "sources.confirmDifferentRepositoryDescription",
                  {
                    repository: selectedRepository.key,
                    product: product.name,
                  },
                ),
                confirmLabel: t("sources.confirmDifferentRepository"),
              }).then((approved) => {
                if (approved) return connect();
              });
            }}
          >
            {busy ? t("sources.connecting") : t("sources.connect")}
          </button>
        </div>
      </section>
      <div className="knowledge-source-list">
        {visibleSources.length ? (
          visibleSources.map((source) => {
            const current = source.freshness === "current";
            const syncing =
              source.syncState === "running" || source.syncState === "queued";
            const failed = source.syncState === "failed";
            const statusDescription =
              source.syncState === "queued"
                ? "sources.status.queued"
                : source.syncState === "running"
                  ? "sources.status.running"
                  : failed
                    ? "sources.status.failed"
                    : source.freshness === "empty"
                      ? "sources.status.empty"
                      : source.observedSha &&
                          source.observedSha !== source.indexedSha
                        ? "sources.status.changesDetected"
                        : source.indexedSha !== source.activeSha
                          ? "sources.status.awaitingProduction"
                          : "sources.status.current";
            return (
              <article className="knowledge-source-card" key={source.id}>
                <header>
                  <strong>{source.repositoryName}</strong>
                  <span
                    className={
                      current
                        ? "knowledge-source-state current"
                        : "knowledge-source-state stale"
                    }
                  >
                    {syncing ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : current ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <CircleAlert size={14} />
                    )}
                    {t(
                      syncing
                        ? "sources.freshness.syncing"
                        : failed
                          ? "sources.freshness.failed"
                          : `sources.freshness.${source.freshness}`,
                    )}
                  </span>
                </header>
                <p className="knowledge-source-description" aria-live="polite">
                  {t(statusDescription)}
                </p>
                {syncing ? (
                  <div
                    className="knowledge-source-progress"
                    role="progressbar"
                    aria-label={t("sources.progressLabel", {
                      repository: source.repositoryName,
                    })}
                    aria-valuetext={t(
                      source.syncState === "queued"
                        ? "sources.progressQueued"
                        : "sources.progressRunning",
                    )}
                  >
                    <span />
                  </div>
                ) : null}
                <div className="knowledge-source-meta">
                  <span>
                    <GitBranch size={13} /> {source.refName}
                  </span>
                  <span>
                    {t("sources.observed")}:{" "}
                    <code title={source.observedSha}>
                      {shortSha(source.observedSha)}
                    </code>
                  </span>
                  <span>
                    {t("sources.indexed")}:{" "}
                    <code title={source.indexedSha}>
                      {shortSha(source.indexedSha)}
                    </code>
                  </span>
                  <span>
                    {t("sources.active")}:{" "}
                    <code title={source.activeSha}>
                      {shortSha(source.activeSha)}
                    </code>
                  </span>
                </div>
                <p className="knowledge-source-products">
                  {t("sources.usedBy")}:{" "}
                  {source.productIds
                    .map(
                      (id) =>
                        products.find((product) => product.id === id)?.name,
                    )
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {source.errorCode ? (
                  <small>
                    {t("sources.error", { code: source.errorCode })}
                  </small>
                ) : null}
                <footer>
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={busy || syncing}
                    onClick={() => void onSync(source.id)}
                  >
                    {syncing ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <RefreshCw size={13} />
                    )}{" "}
                    {syncing
                      ? t("sources.syncing")
                      : source.freshness === "empty"
                        ? t("sources.startFirstSync")
                        : t("sources.checkUpdates")}
                  </button>
                  {source.indexedSha &&
                  source.indexedSha !== source.activeSha ? (
                    <button
                      className="button button-primary button-small"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void confirm({
                          title: t("sources.activateTitle"),
                          description: t("sources.activateDescription", {
                            sha: shortSha(source.indexedSha),
                            repository: source.repositoryName,
                          }),
                          confirmLabel: t("sources.activate"),
                        }).then((approved) => {
                          if (approved)
                            return onActivate(source.id, source.indexedSha!);
                        })
                      }
                    >
                      {t("sources.activate")}
                    </button>
                  ) : null}
                  <button
                    className="button button-danger button-small"
                    type="button"
                    disabled={busy || syncing}
                    onClick={() =>
                      void confirm({
                        title: t("sources.removeTitle"),
                        description: t("sources.removeDescription", {
                          repository: source.repositoryName,
                        }),
                        confirmLabel: t("sources.remove"),
                        destructive: true,
                      }).then((approved) => {
                        if (approved) return onRemove(source.id);
                      })
                    }
                  >
                    <Trash2 size={13} /> {t("sources.remove")}
                  </button>
                </footer>
              </article>
            );
          })
        ) : (
          <div className="knowledge-source-empty">
            <GitBranch size={20} />
            <strong>
              {selectedProductId === "all"
                ? t("sources.empty")
                : t("sources.emptyForProduct")}
            </strong>
            <span>
              {selectedProductId === "all"
                ? t("sources.emptyDescription")
                : t("sources.emptyForProductDescription")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
