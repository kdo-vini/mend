import { CheckCircle2, GitBranch, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LiveRepository } from "../../../api/live-actions";
import type { KnowledgeProduct, KnowledgeSourceSummary } from "../../../types";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { Select } from "../../../shared/ui/Select";

const shortSha = (value?: string) => value?.slice(0, 8) || "—";

export function KnowledgeSourcesPanel({
  products,
  repositories,
  sources,
  busy,
  confirm,
  onCreate,
  onSync,
  onActivate,
}: {
  products: KnowledgeProduct[];
  repositories: LiveRepository[];
  sources: KnowledgeSourceSummary[];
  busy: boolean;
  confirm: Confirm;
  onCreate: (input: {
    repositoryId: string;
    productIds: string[];
    refName: string;
  }) => Promise<void>;
  onSync: (sourceId: string) => Promise<void>;
  onActivate: (sourceId: string, sha: string) => Promise<void>;
}) {
  const { t } = useTranslation("knowledge");
  const available = repositories.filter(
    (repository) =>
      !sources.some((source) => source.repositoryId === repository.id),
  );
  const [repositoryId, setRepositoryId] = useState(available[0]?.id ?? "");
  const [productIds, setProductIds] = useState<string[]>([]);
  const repository = repositories.find((item) => item.id === repositoryId);
  const toggle = (id: string) =>
    setProductIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  return (
    <div className="knowledge-sources">
      <section className="knowledge-source-create">
        <div>
          <h2>{t("sources.connectTitle")}</h2>
          <p>{t("sources.connectDescription")}</p>
        </div>
        <div className="knowledge-source-form">
          <label>
            {t("sources.repository")}
            <Select
              value={repositoryId}
              options={available.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={setRepositoryId}
            />
          </label>
          <fieldset>
            <legend>{t("sources.products")}</legend>
            <div className="knowledge-product-checks">
              {products
                .filter((product) => product.status === "active")
                .map((product) => (
                  <label key={product.id}>
                    <input
                      type="checkbox"
                      checked={productIds.includes(product.id)}
                      onChange={() => toggle(product.id)}
                    />{" "}
                    {product.name}
                  </label>
                ))}
            </div>
          </fieldset>
          <button
            className="button button-primary"
            type="button"
            disabled={busy || !repositoryId || !productIds.length}
            onClick={() =>
              void onCreate({
                repositoryId,
                productIds,
                refName: repository?.defaultBranch || "main",
              })
            }
          >
            {t("sources.connect")}
          </button>
        </div>
      </section>
      <div className="knowledge-source-list">
        {sources.length ? (
          sources.map((source) => {
            const current = source.freshness === "current";
            return (
              <article className="knowledge-source-card" key={source.id}>
                <header>
                  <span
                    className={
                      current
                        ? "knowledge-source-state current"
                        : "knowledge-source-state stale"
                    }
                  >
                    {current ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <ShieldAlert size={14} />
                    )}
                    {t(`sources.freshness.${source.freshness}`)}
                  </span>
                  <strong>{source.repositoryName}</strong>
                </header>
                <div className="knowledge-source-meta">
                  <span>
                    <GitBranch size={13} /> {source.refName}
                  </span>
                  <span>
                    {t("sources.observed")}:{" "}
                    <code>{shortSha(source.observedSha)}</code>
                  </span>
                  <span>
                    {t("sources.indexed")}:{" "}
                    <code>{shortSha(source.indexedSha)}</code>
                  </span>
                  <span>
                    {t("sources.active")}:{" "}
                    <code>{shortSha(source.activeSha)}</code>
                  </span>
                </div>
                <p>
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
                    disabled={
                      busy ||
                      source.syncState === "running" ||
                      source.syncState === "queued"
                    }
                    onClick={() => void onSync(source.id)}
                  >
                    <RefreshCw size={13} /> {t("sources.sync")}
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
                </footer>
              </article>
            );
          })
        ) : (
          <div className="knowledge-source-empty">
            <GitBranch size={20} />
            <strong>{t("sources.empty")}</strong>
            <span>{t("sources.emptyDescription")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
