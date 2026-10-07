import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { projectsApi, type Project } from "../projects/api";
import { ProjectCatalogContext } from "../projects/ProjectCatalogContext";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Lock,
  Search,
} from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { EmptyState, ErrorState } from "../../shared/ui/ResourceState";
import {
  financeApi,
  type FinanceAttentionFilter,
  type FinanceRecord,
} from "./api";
import {
  currentMonth,
  editDraft,
  FINANCE_PAGE_SIZE,
  ledgerViews,
  matchesFilter,
  monthPeriod,
  newEntryDraft,
  newReferenceDraft,
  newSettlementDraft,
  newTemplateDraft,
  reviewDraft,
  type FinanceDraft,
  type LedgerView,
} from "./model";
import { isForbidden, useFinanceData } from "./useFinanceData";
import { useFinanceEditor, type DraftEditor } from "./useFinanceEditor";
import { useFinanceFormat } from "./format";
import { MonthNavigator } from "./components/MonthNavigator";
import {
  FinanceSummaryPanel,
  FinanceSummarySkeleton,
} from "./components/FinanceSummaryPanel";
import { FinanceForm } from "./components/FinanceForm";
import { HistoryPanel } from "./components/HistoryPanel";
import { LedgerTable, type LedgerAction } from "./components/LedgerTable";
import { ZeloFinancePanel } from "./components/ZeloFinancePanel";
import { FinanceAttention } from "./components/FinanceAttention";
import { ProviderBalancesPanel } from "./components/ProviderBalancesPanel";

/**
 * Diagium finance: month navigation, grouped accrual/cash figures, the ledger
 * views and one contextual panel (form or history). Domain forms, the table
 * and data loading live in their own modules; this page only orchestrates.
 *
 * Diagium owns the projects. Provider receipts belong to Zelo and remain
 * read-only alongside manual project records, without importing duplicates.
 */
export function FinancePage() {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = searchParams.get("project") ?? undefined;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<LedgerView>("entries");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const [attention, setAttention] = useState<FinanceAttentionFilter>();
  const [history, setHistory] = useState<FinanceRecord | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const period = monthPeriod(month);
  const data = useFinanceData({
    period,
    entity: view,
    offset,
    project,
    attention,
  });
  const { revoke, invalidate } = data;

  const onSaved = useCallback(
    (saved: FinanceDraft) => {
      setNotice(t(`finance.notices.${saved.entity}`));
      invalidate();
    },
    [invalidate, t],
  );
  const editor = useFinanceEditor({ onSaved, onForbidden: revoke });
  const closeHistory = useCallback(() => setHistory(null), []);

  const closeEditor = editor.close;
  useEffect(() => {
    // Revoked access drops every open draft and audit view with the data.
    if (data.allowed !== false) return;
    closeEditor();
    setHistory(null);
  }, [data.allowed, closeEditor]);
  useEffect(() => {
    if (!data.allowed) return;
    let active = true;
    setProjectsFailed(false);
    projectsApi
      .list()
      .then(({ data }) => {
        if (active) setProjects(data);
      })
      .catch((error) => {
        if (!active) return;
        setProjects([]);
        if (isForbidden(error)) revoke();
        else setProjectsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [data.allowed, revoke]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openDraft = (draft: FinanceDraft) => {
    setHistory(null);
    setNotice("");
    setRemoving(false);
    editor.open(draft);
  };

  const changeMonth = (next: string) => {
    setMonth(next);
    setOffset(0);
    setHistory(null);
  };

  const changeView = (next: LedgerView) => {
    setAttention(undefined);
    setView(next);
    setOffset(0);
    setFilter("");
  };

  const onRowAction = (action: LedgerAction, row: FinanceRecord) => {
    if (action === "remove" && (view === "entries" || view === "settlements")) {
      const draft = editDraft(view, row);
      openDraft({
        ...draft,
        record: { ...draft.record, cancelled: true, reason: "" },
      });
      setRemoving(true);
    } else if (action === "history") {
      editor.close();
      setHistory(row);
    } else if (action === "edit") openDraft(editDraft(view, row));
    else if (action === "settle") openDraft(newSettlementDraft(row));
    else if (view === "entries" || view === "settlements")
      openDraft(newReferenceDraft({ entity: view, row }));
  };

  const generate = async () => {
    setGenerating(true);
    setActionError("");
    try {
      const result = await financeApi.generate(period);
      setNotice(
        t("finance.generated", {
          count: result.generated,
          month: format.month(period),
        }),
      );
      invalidate();
    } catch (err) {
      if (isForbidden(err)) revoke();
      else setActionError(t("finance.errors.generic"));
    } finally {
      setGenerating(false);
    }
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = ledgerViews.indexOf(
      event.currentTarget.dataset.view as LedgerView,
    );
    const next =
      event.key === "ArrowRight"
        ? ledgerViews[(index + 1) % ledgerViews.length]
        : event.key === "ArrowLeft"
          ? ledgerViews[(index + ledgerViews.length - 1) % ledgerViews.length]
          : event.key === "Home"
            ? ledgerViews[0]
            : event.key === "End"
              ? ledgerViews[ledgerViews.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    changeView(next);
    document.getElementById(`finance-tab-${next}`)?.focus();
  };

  const allowed = data.allowed;
  const summary = data.summary;
  const listForView =
    data.list &&
    data.list.key.split("|")[0] === view &&
    (data.list.key.split("|")[3] || undefined) === attention
      ? data.list
      : null;
  const listStale =
    data.pending.list || listForView?.key !== data.requestedListKey;
  const rows = listForView?.data.filter((row) => matchesFilter(row, filter));
  const busy = editor.busy || generating;
  const loadError = data.error;
  const showProviderIncome =
    allowed === true && (project === undefined || project === "Zelo");

  return (
    <section className="page finance-page">
      <PageHeader
        title={t("finance.title")}
        description={t("finance.description")}
        actions={
          allowed ? (
            <>
              <label className="finance-business">
                <span>{t("finance.projectFilter")}</span>
                <select
                  value={project ?? "__all"}
                  disabled={busy}
                  onChange={(event) => {
                    const next = new URLSearchParams(searchParams);
                    if (event.target.value === "__all") next.delete("project");
                    else next.set("project", event.target.value);
                    setSearchParams(next);
                    setOffset(0);
                    setHistory(null);
                  }}
                >
                  <option value="__all">{t("finance.allProjects")}</option>
                  <option value="">{t("finance.generalCosts")}</option>
                  {!projects.some((item) => item.key === "Zelo") && (
                    <option value="Zelo">{t("finance.business.zelo")}</option>
                  )}
                  {projects.map((item) => (
                    <option key={item.id} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                  {project &&
                    project !== "Zelo" &&
                    !projects.some((item) => item.key === project) && (
                      <option value={project}>{project}</option>
                    )}
                </select>
              </label>
              <Link to="/projects" className="button button-ghost">
                {t("finance.manageProjects")}
              </Link>
              {
                <>
                  <button
                    type="button"
                    className="button button-ghost finance-new"
                    disabled={busy}
                    onClick={() => {
                      const draft = newEntryDraft("income", period);
                      openDraft({
                        ...draft,
                        record: { ...draft.record, project: project ?? "" },
                      });
                    }}
                  >
                    <ArrowDownLeft size={14} aria-hidden="true" />
                    {t("finance.newIncome")}
                  </button>
                  <button
                    type="button"
                    className="button button-primary finance-new"
                    disabled={busy}
                    onClick={() => {
                      const draft = newEntryDraft("expense", period);
                      openDraft({
                        ...draft,
                        record: { ...draft.record, project: project ?? "" },
                      });
                    }}
                  >
                    <ArrowUpRight size={14} aria-hidden="true" />
                    {t("finance.newExpense")}
                  </button>
                </>
              }
            </>
          ) : undefined
        }
      />

      {loadError && allowed !== false ? (
        <ErrorState
          title={t("finance.errors.loadTitle")}
          description={t("finance.errors.load")}
          onRetry={data.retry}
        />
      ) : null}

      {allowed === false && (
        <div className="finance-restricted" role="status">
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>{t("finance.restrictedTitle")}</strong>
            <p>{t("finance.restricted")}</p>
          </div>
        </div>
      )}

      {allowed === null && !loadError && <FinanceSummarySkeleton />}

      {allowed && (
        <div className="finance-diagium">
          {projectsFailed && (
            <p role="alert">
              {t("finance.projectsUnavailable")}{" "}
              <Link to="/projects">{t("finance.manageProjects")}</Link>
            </p>
          )}
          <div className="finance-period-bar">
            <MonthNavigator month={month} onChange={changeMonth} />
            <p
              className="finance-sync"
              data-success={Boolean(notice) || undefined}
              role="status"
              aria-live="polite"
            >
              {notice ? (
                <CheckCircle2 size={15} aria-hidden="true" />
              ) : (data.pending.summary || data.pending.list) && summary ? (
                <LoaderCircle
                  className="finance-spinner"
                  size={15}
                  aria-hidden="true"
                />
              ) : null}
              {notice ||
                ((data.pending.summary || data.pending.list) && summary
                  ? t("finance.refreshing")
                  : "")}
            </p>
          </div>

          <h2 className="finance-section-title">
            {t("finance.manualEntries")}
          </h2>
          <div className="finance-overview-grid">
            {summary ? (
              <FinanceSummaryPanel
                summary={summary.data}
                period={summary.period}
                refreshing={summary.period !== period || data.pending.summary}
                showCoverage={false}
              />
            ) : (
              <FinanceSummarySkeleton />
            )}

            {summary && (
              <FinanceAttention
                summary={summary.data}
                period={summary.period}
                disabled={
                  busy || summary.period !== period || data.pending.summary
                }
                onReview={() =>
                  openDraft(reviewDraft(period, summary.data.review))
                }
                onView={(next) => {
                  changeView(next);
                  document.getElementById(`finance-tab-${next}`)?.focus();
                }}
                onResolve={(next) => {
                  changeView("entries");
                  setAttention(next);
                  document.getElementById("finance-tab-entries")?.focus();
                }}
              />
            )}
          </div>

          {showProviderIncome && (
            <section className="finance-automatic">
              <h2>{t("finance.automaticIncome")}</h2>
              <ProviderBalancesPanel onForbidden={revoke} />
              <ZeloFinancePanel
                manualReceived={
                  summary?.period === period &&
                  !data.pending.summary &&
                  !loadError
                    ? summary.data.received
                    : undefined
                }
                month={month}
                onMonthChange={changeMonth}
                onForbidden={revoke}
                embedded
              />
            </section>
          )}

          {actionError && (
            <p role="alert" className="finance-form-error">
              {actionError}
            </p>
          )}

          <div
            className="finance-workspace"
            data-editing={Boolean(editor.draft || history) || undefined}
          >
            {editor.draft && (
              <ProjectCatalogContext.Provider value={projects}>
                <FinanceForm
                  editor={editor as DraftEditor}
                  removing={removing}
                />
              </ProjectCatalogContext.Provider>
            )}
            {history && !editor.draft && (
              <HistoryPanel
                recordId={history.id}
                title={String(
                  history.description ?? t("finance.context.untitled"),
                )}
                onClose={closeHistory}
                onForbidden={revoke}
              />
            )}

            <section
              className="finance-ledger"
              aria-label={t("finance.ledger")}
            >
              <div
                className="finance-tabs"
                role="tablist"
                aria-label={t("finance.viewsLabel")}
              >
                {ledgerViews.map((tab) => (
                  <button
                    key={tab}
                    id={`finance-tab-${tab}`}
                    data-view={tab}
                    type="button"
                    role="tab"
                    aria-selected={view === tab}
                    aria-controls="finance-tabpanel"
                    tabIndex={view === tab ? 0 : -1}
                    onKeyDown={onTabKey}
                    onClick={() => changeView(tab)}
                  >
                    {t(`finance.views.${tab}`)}
                  </button>
                ))}
              </div>

              <div
                id="finance-tabpanel"
                role="tabpanel"
                aria-labelledby={`finance-tab-${view}`}
                aria-busy={listStale || undefined}
                className="finance-tabpanel"
              >
                {attention && (
                  <div className="finance-pending-context" role="status">
                    <div>
                      <strong>{t(`finance.pending.${attention}`)}</strong>
                      <p>{t("finance.pending.hint")}</p>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => changeView("entries")}
                    >
                      {t("finance.pending.clear")}
                    </button>
                  </div>
                )}
                <div className="finance-toolbar">
                  <label className="finance-search">
                    <Search size={14} aria-hidden="true" />
                    <span className="sr-only">{t("finance.filter.label")}</span>
                    <input
                      type="search"
                      value={filter}
                      placeholder={t("finance.filter.placeholder")}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </label>
                  {view === "templates" && (
                    <div className="finance-toolbar-actions">
                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={busy}
                        onClick={() => openDraft(newTemplateDraft(period))}
                      >
                        {t("finance.newTemplate")}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={busy}
                        aria-busy={generating || undefined}
                        onClick={() => void generate()}
                      >
                        {generating
                          ? t("finance.generating")
                          : t("finance.generate", {
                              month: format.shortMonth(period),
                            })}
                      </button>
                    </div>
                  )}
                </div>
                <p className="finance-view-hint">
                  {t(`finance.viewHints.${view}`)}
                </p>

                {!listForView ? (
                  <div className="finance-table-skeleton" role="status">
                    <span className="sr-only">{t("finance.loading")}</span>
                    {Array.from({ length: 4 }, (_, index) => (
                      <span key={index} className="skeleton" />
                    ))}
                  </div>
                ) : listForView.data.length === 0 ? (
                  <EmptyState
                    title={t(
                      attention
                        ? "finance.pending.emptyTitle"
                        : `finance.empty.${view}.title`,
                    )}
                    description={t(
                      attention
                        ? "finance.pending.emptyHint"
                        : `finance.empty.${view}.description`,
                    )}
                  />
                ) : rows && rows.length === 0 ? (
                  <EmptyState
                    search
                    title={t("finance.filter.noMatchTitle")}
                    description={t("finance.filter.noMatch")}
                  />
                ) : (
                  <div
                    className="finance-table-region"
                    data-refreshing={listStale || undefined}
                  >
                    <LedgerTable
                      view={view}
                      rows={rows ?? []}
                      busy={busy || listStale || Boolean(loadError)}
                      onAction={onRowAction}
                    />
                  </div>
                )}

                {(offset > 0 || listForView?.nextOffset != null) && (
                  <nav
                    className="finance-pagination"
                    aria-label={t("finance.pagination.label")}
                  >
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={offset === 0}
                      onClick={() =>
                        setOffset(Math.max(0, offset - FINANCE_PAGE_SIZE))
                      }
                    >
                      {t("finance.previous")}
                    </button>
                    <span>
                      {t("finance.pagination.page", {
                        page: offset / FINANCE_PAGE_SIZE + 1,
                      })}
                    </span>
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={listForView?.nextOffset == null}
                      onClick={() =>
                        listForView?.nextOffset != null &&
                        setOffset(listForView.nextOffset)
                      }
                    >
                      {t("finance.next")}
                    </button>
                  </nav>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
