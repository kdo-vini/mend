import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Select } from "../../shared/ui/Select";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/ui/ResourceState";
import {
  clientSources,
  clientStages,
  clientsApi,
  type ClientPermissions,
  type ClientSource,
  type ClientStage,
  type ClientSummary,
} from "./api";
import { formatUpdated } from "./format";
import {
  areaOptions,
  demoSearch,
  emptyFilters,
  filterClients,
  filtersFromParams,
  filtersToParams,
  recentDiagnosticLeads,
  stageCounts,
  type ClientFilters,
} from "./model";
import { NewClientDialog } from "./NewClientDialog";
import { StagePill } from "./StagePill";

export function ClientsPage() {
  const { t } = useTranslation("clients");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [permissions, setPermissions] = useState<ClientPermissions>({
    canEdit: false,
    canArchive: false,
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const showArchived = filters.archived;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const active = await clientsApi.list(false);
      const merged = new Map(active.data.map((client) => [client.id, client]));
      if (showArchived) {
        const archived = await clientsApi.list(true);
        for (const client of archived.data) merged.set(client.id, client);
      }
      setClients([...merged.values()]);
      setPermissions(active.permissions);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => void load(), [load]);

  const update = (patch: Partial<ClientFilters>) => {
    const next = filtersToParams({ ...filters, ...patch });
    if (params.get("demo")) next.set("demo", params.get("demo")!);
    setParams(next, { replace: true });
  };
  const carry = demoSearch(useLocation().search);

  const counts = useMemo(() => stageCounts(clients), [clients]);
  const recent = useMemo(() => recentDiagnosticLeads(clients), [clients]);
  const areas = useMemo(() => areaOptions(clients), [clients]);
  const visible = useMemo(
    () => filterClients(clients, filters),
    [clients, filters],
  );
  const hasFilters =
    Boolean(filters.q.trim()) ||
    Boolean(filters.stage) ||
    Boolean(filters.area) ||
    Boolean(filters.source);

  const actions = permissions.canEdit ? (
    <button
      ref={createTriggerRef}
      className="button button-primary"
      type="button"
      onClick={() => setCreateOpen(true)}
    >
      <Plus size={15} aria-hidden="true" /> {t("actions.new")}
    </button>
  ) : undefined;

  return (
    <main className="page clients-page">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={actions}
      />

      {loading && clients.length === 0 && !failed ? (
        <LoadingState label={t("loading")} />
      ) : failed && clients.length === 0 ? (
        <ErrorState
          title={t("errors.load.title")}
          description={t("errors.load.description")}
          onRetry={() => void load()}
        />
      ) : (
        <>
          <section
            className="clients-deep"
            aria-label={t("funnel.label")}
            role="region"
          >
            <div className="clients-deep-lead">
              <small>{t("funnel.title")}</small>
              <div className="clients-deep-hero">{counts.lead}</div>
              <div className="clients-deep-sub">
                <b>{t("funnel.recent", { count: recent })}</b>{" "}
                {t("funnel.recentSource")}
              </div>
            </div>
            <div
              className="clients-funnel"
              role="group"
              aria-label={t("funnel.filterLabel")}
            >
              {clientStages.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={filters.stage === stage}
                  onClick={() =>
                    update({ stage: filters.stage === stage ? "" : stage })
                  }
                >
                  <b>{counts[stage]}</b>
                  <span>{t(`stages.${stage}`)}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="clients-controls" role="search">
            <input
              className="clients-search"
              type="search"
              value={filters.q}
              placeholder={t("filters.searchPlaceholder")}
              aria-label={t("filters.search")}
              onChange={(event) => update({ q: event.target.value })}
            />
            <Select
              ariaLabel={t("filters.stage")}
              value={filters.stage}
              onChange={(value) => update({ stage: value as ClientStage | "" })}
              options={[
                { value: "", label: t("filters.allStages") },
                ...clientStages.map((stage) => ({
                  value: stage,
                  label: t(`stages.${stage}`),
                })),
              ]}
            />
            <Select
              ariaLabel={t("filters.area")}
              value={filters.area}
              onChange={(value) => update({ area: value })}
              options={[
                { value: "", label: t("filters.allAreas") },
                ...(filters.area && !areas.includes(filters.area)
                  ? [{ value: filters.area, label: filters.area }]
                  : []),
                ...areas.map((area) => ({ value: area, label: area })),
              ]}
            />
            <Select
              ariaLabel={t("filters.source")}
              value={filters.source}
              onChange={(value) =>
                update({ source: value as ClientSource | "" })
              }
              options={[
                { value: "", label: t("filters.allSources") },
                ...clientSources.map((source) => ({
                  value: source,
                  label: t(`sources.${source}`),
                })),
              ]}
            />
            <label className="clients-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => update({ archived: event.target.checked })}
              />
              <span>{t("filters.showArchived")}</span>
            </label>
            <span className="clients-count" aria-live="polite">
              {t("filters.count", { count: visible.length })}
            </span>
          </div>

          {failed && (
            <div className="clients-error" role="alert">
              <span>{t("errors.load.description")}</span>
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => void load()}
              >
                {t("actions.retry")}
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <section className="clients-empty-surface">
              {clients.length === 0 ? (
                <EmptyState
                  title={t("empty.title")}
                  description={t("empty.description")}
                  action={
                    permissions.canEdit ? (
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => setCreateOpen(true)}
                      >
                        <Plus size={15} aria-hidden="true" /> {t("actions.new")}
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState
                  search
                  title={t("empty.filteredTitle")}
                  description={t("empty.filteredDescription")}
                  action={
                    hasFilters ? (
                      <button
                        className="button button-ghost"
                        type="button"
                        onClick={() =>
                          update({
                            ...emptyFilters,
                            archived: filters.archived,
                          })
                        }
                      >
                        {t("actions.clearFilters")}
                      </button>
                    ) : undefined
                  }
                />
              )}
            </section>
          ) : (
            <div className="clients-table-card">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th scope="col">{t("columns.client")}</th>
                    <th scope="col">{t("columns.stage")}</th>
                    <th scope="col">{t("columns.area")}</th>
                    <th scope="col">{t("columns.product")}</th>
                    <th scope="col">{t("columns.phone")}</th>
                    <th scope="col">{t("columns.source")}</th>
                    <th scope="col">{t("columns.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((client) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      carry={carry}
                      onOpen={() => navigate(`/clientes/${client.id}${carry}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <NewClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/clientes/${id}${carry}`)}
        returnFocusRef={createTriggerRef}
      />
    </main>
  );
}

function ClientRow({
  client,
  carry,
  onOpen,
}: {
  client: ClientSummary;
  carry: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation("clients");
  const subline = [
    client.contact,
    client.referral ? t("row.referral", { name: client.referral }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const products = client.products
    .map((product) => t(`products.${product}`))
    .join(", ");
  return (
    <tr
      className={client.archived_at ? "is-archived" : undefined}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) return;
        onOpen();
      }}
    >
      <td>
        <Link
          className="clients-name-link"
          to={`/clientes/${client.id}${carry}`}
        >
          {client.name}
        </Link>
        {(subline || client.archived_at) && (
          <div className="clients-sub">
            {client.archived_at && (
              <span className="client-tag">{t("row.archived")}</span>
            )}{" "}
            {subline}
          </div>
        )}
      </td>
      <td className="stage-cell">
        <StagePill stage={client.stage} />
      </td>
      <td className="area-cell">
        {client.area ?? <span className="clients-muted">—</span>}
        {client.specialty && (
          <span className="clients-sub"> · {client.specialty}</span>
        )}
      </td>
      <td className="hide-m">
        {products || <span className="clients-muted">—</span>}
      </td>
      <td className="hide-m clients-nowrap">
        {client.phone || <span className="clients-muted">—</span>}
      </td>
      <td className="hide-m">
        <span
          className={`client-tag${client.source === "diagnostico_marca" ? " origin" : ""}`}
        >
          {t(`sourcesShort.${client.source}`)}
        </span>
      </td>
      <td className="hide-m clients-muted clients-nowrap">
        {formatUpdated(client.updated_at)}
      </td>
    </tr>
  );
}
