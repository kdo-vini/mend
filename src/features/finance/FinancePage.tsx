import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
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

type Business = "diagium" | "zelo";

/**
 * Diagium finance: month navigation, grouped accrual/cash figures, the ledger
 * views and one contextual panel (form or history). Domain forms, the table
 * and data loading live in their own modules; this page only orchestrates.
 *
 * The Business switch shows the read-only Zelo payments instead. The Diagium
 * body is only hidden meanwhile, so an open draft survives the round trip.
 */
export function FinancePage() {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const [business, setBusiness] = useState<Business>("diagium");
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<LedgerView>("entries");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const [attention, setAttention] = useState<FinanceAttentionFilter>();
  const [history, setHistory] = useState<FinanceRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const period = monthPeriod(month);
  const data = useFinanceData({
    period,
    entity: view,
    offset,
    enabled: business === "diagium",
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
    setBusiness("diagium");
  }, [data.allowed, closeEditor]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openDraft = (draft: FinanceDraft) => {
    setHistory(null);
    setNotice("");
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
    if (action === "history") {
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
    data.list.key.split("|")[3] === attention
      ? data.list
      : null;
  const listStale =
    data.pending.list || listForView?.key !== data.requestedListKey;
  const rows = listForView?.data.filter((row) => matchesFilter(row, filter));
  const busy = editor.busy || generating;
  const loadError = data.error;
  const isZelo = allowed === true && business === "zelo";

  return (
    <section className="page finance-page">
      <PageHeader
        title={isZelo ? t("finance.zelo.title") : t("finance.title")}
        description={
          isZelo ? t("finance.zelo.description") : t("finance.description")
        }
        actions={
          allowed ? (
            <>
              <label className="finance-business">
                <span>{t("finance.business.label")}</span>
                <select
                  value={business}
                  disabled={busy}
                  onChange={(event) =>
                    setBusiness(event.target.value as Business)
                  }
                >
                  <option value="diagium">
                    {t("finance.business.diagium")}
                  </option>
                  <option value="zelo">{t("finance.business.zelo")}</option>
                </select>
              </label>
              {!isZelo && (
                <>
                  <button
                    type="button"
                    className="button button-ghost finance-new"
                    disabled={busy}
                    onClick={() => openDraft(newEntryDraft("income", period))}
                  >
                    <ArrowDownLeft size={14} aria-hidden="true" />
                    {t("finance.newIncome")}
                  </button>
                  <button
                    type="button"
                    className="button button-primary finance-new"
                    disabled={busy}
                    onClick={() => openDraft(newEntryDraft("expense", period))}
                  >
                    <ArrowUpRight size={14} aria-hidden="true" />
                    {t("finance.newExpense")}
                  </button>
                </>
              )}
            </>
          ) : undefined
        }
      />

      {loadError && allowed !== false && !isZelo ? (
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

      {isZelo && (
        <ZeloFinancePanel
          month={month}
          onMonthChange={changeMonth}
          onForbidden={revoke}
        />
      )}

      {allowed && (
        <div className="finance-diagium" hidden={isZelo}>
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

          {actionError && (
            <p role="alert" className="finance-form-error">
              {actionError}
            </p>
          )}

          <div
            className="finance-workspace"
            data-editing={Boolean(editor.draft || history) || undefined}
          >
            {editor.draft && <FinanceForm editor={editor as DraftEditor} />}
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
