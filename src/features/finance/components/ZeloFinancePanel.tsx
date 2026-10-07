import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  RefreshCw,
} from "lucide-react";
import { EmptyState, ErrorState } from "../../../shared/ui/ResourceState";
import type { ZeloFinanceFeed, ZeloPayment, ZeloProviderState } from "../api";
import { FINANCE_PAGE_SIZE, monthPeriod, todayCivil } from "../model";
import { useFinanceFormat } from "../format";
import { useZeloFinance } from "../useZeloFinance";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { FinanceSummarySkeleton } from "./FinanceSummaryPanel";

type Provider = ZeloPayment["provider"];
type ProviderFilter = Provider | "all";
const providers: readonly Provider[] = ["abacatepay", "stripe"];
const columns = [
  "charge",
  "source",
  "status",
  "created",
  "paid",
  "billed",
  "received",
  "fee",
  "net",
  "available",
] as const;

const stateIcon: Record<ZeloProviderState, typeof CheckCircle2> = {
  ok: CheckCircle2,
  partial: AlertTriangle,
  unavailable: AlertCircle,
  not_configured: MinusCircle,
};

/** São Paulo civil month (`YYYY-MM`) of an ISO instant. */
const civilMonth = (iso: string) => todayCivil(new Date(iso)).slice(0, 7);

/** Currency and São Paulo date formatting in the active interface language. */
function useZeloFormat() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  return useMemo(() => {
    const currencies = new Map<string, Intl.NumberFormat>();
    const fallback = new Intl.NumberFormat(language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const date = new Intl.DateTimeFormat(language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    return {
      money: (cents: number, currency: string) => {
        let formatter = currencies.get(currency);
        if (!formatter) {
          try {
            formatter = new Intl.NumberFormat(language, {
              style: "currency",
              currency,
            });
          } catch {
            return `${fallback.format(cents / 100)} ${currency}`;
          }
          currencies.set(currency, formatter);
        }
        return formatter.format(cents / 100);
      },
      date: (iso: string) => date.format(new Date(iso)),
    };
  }, [language]);
}

/**
 * Read-only Zelo payments for one month, separate from Diagium figures.
 * Mounted only after the finance access check succeeded; any 401/403 calls
 * `onForbidden`, which drops this panel and the cache.
 */
export function ZeloFinancePanel({
  month,
  onForbidden,
  manualReceived,
  children,
}: {
  month: string;
  onForbidden: () => void;
  manualReceived?: number;
  /** Further collapsible cards of the section, e.g. provider balances. */
  children?: ReactNode;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const zelo = useZeloFormat();
  const period = monthPeriod(month);
  const { feed, pending, failed, refresh } = useZeloFinance({
    period,
    onForbidden,
  });
  const [provider, setProvider] = useState<ProviderFilter>("all");
  // Page resets whenever the month or source filter changes.
  const pageKey = `${period}|${provider}`;
  const [paging, setPaging] = useState({ key: pageKey, page: 0 });
  const page = paging.key === pageKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ key: pageKey, page: next });

  const targetMonth = format.month(period);
  const shown = feed?.period ?? null;
  const shownMonth = shown ? format.month(shown) : "";
  const isStale = shown !== null && shown !== period;
  const refreshing = isStale || pending;

  const status = (() => {
    if (!feed) return pending ? t("finance.zelo.loading") : "";
    if (isStale)
      return failed
        ? t("finance.zelo.staleFailed", {
            shown: shownMonth,
            month: targetMonth,
          })
        : t("finance.zelo.showingOther", {
            shown: shownMonth,
            month: targetMonth,
          });
    if (pending) return t("finance.zelo.updating");
    return t("finance.zelo.checkedAt", {
      time: format.dateTime(feed.data.checkedAt),
    });
  })();
  const brl = feed?.data.totals.find(
    (total) => total.currency.toUpperCase() === "BRL",
  );

  return (
    <section
      className="finance-section finance-zelo"
      aria-labelledby="finance-zelo-title"
    >
      <header className="finance-section-header">
        <h2 id="finance-zelo-title">{t("finance.automaticIncome")}</h2>
        <div className="finance-zelo-sync">
          <p className="finance-sync" role="status" aria-live="polite">
            {status}
          </p>
          <button
            type="button"
            className="button button-ghost"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={refresh}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {pending ? t("finance.zelo.refreshing") : t("finance.zelo.refresh")}
          </button>
        </div>
      </header>

      <p className="finance-zelo-note">{t("finance.zelo.note")}</p>

      {failed && feed && (
        <div role="alert" className="finance-form-error">
          <AlertCircle size={14} aria-hidden="true" />
          <span>
            {t("finance.zelo.errors.refresh", {
              time: format.dateTime(feed.data.checkedAt),
            })}
          </span>
          <button
            type="button"
            className="button button-ghost"
            disabled={pending}
            onClick={refresh}
          >
            {t("finance.retry")}
          </button>
        </div>
      )}

      {!feed ? (
        failed ? (
          <ErrorState
            title={t("finance.zelo.errors.title")}
            description={t("finance.zelo.errors.description")}
            onRetry={refresh}
          />
        ) : (
          <FinanceSummarySkeleton />
        )
      ) : (
        <>
          <Disclosure
            defaultOpen
            title={t("finance.zelo.receiptsTitle")}
            summary={
              brl && (
                <>
                  {t("finance.zelo.totals.received")}{" "}
                  <strong>{zelo.money(brl.receivedCents, "BRL")}</strong>
                </>
              )
            }
          >
            <ZeloSummary
              manualReceived={!refreshing ? manualReceived : undefined}
              feed={feed.data}
              period={feed.period}
              refreshing={refreshing}
              onRetry={refresh}
              retryDisabled={pending}
            />
          </Disclosure>
          <Disclosure
            title={t("finance.zelo.charges.title", {
              month: format.month(feed.period),
            })}
            summary={t("finance.zelo.charges.count", {
              count: feed.data.rows.length,
            })}
          >
            <ZeloCharges
              feed={feed.data}
              period={feed.period}
              refreshing={refreshing}
              provider={provider}
              onProviderChange={setProvider}
              page={page}
              onPageChange={setPage}
            />
          </Disclosure>
        </>
      )}
      {children}
    </section>
  );
}

function allAnswered(feed: ZeloFinanceFeed) {
  return providers.every((name) => feed.providers[name] === "ok");
}

function ZeloSummary({
  feed,
  period,
  refreshing,
  onRetry,
  retryDisabled,
  manualReceived,
}: {
  feed: ZeloFinanceFeed;
  period: string;
  refreshing: boolean;
  onRetry: () => void;
  retryDisabled: boolean;
  manualReceived?: number;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const money = useZeloFormat().money;
  const month = format.month(period);
  const complete = allAnswered(feed);
  const brl = feed.totals.find(
    (total) => total.currency.toUpperCase() === "BRL",
  );
  const confirmedNet = brl?.netKnownCents ?? (complete && !brl ? 0 : undefined);
  return (
    <section
      className="finance-summary finance-zelo-summary"
      aria-label={t("finance.zelo.summaryLabel", { month })}
      aria-busy={refreshing || undefined}
      data-refreshing={refreshing || undefined}
    >
      {manualReceived !== undefined && confirmedNet !== undefined && (
        <div className="finance-net-rollup">
          <span>{t("finance.zelo.rollup.title")}</span>
          <strong>{money(manualReceived + confirmedNet, "BRL")}</strong>
          <p>
            {t("finance.zelo.rollup.detail", {
              manual: money(manualReceived, "BRL"),
              automatic: money(confirmedNet, "BRL"),
            })}
          </p>
          <small>{t("finance.zelo.rollup.hint")}</small>
        </div>
      )}
      <div className="finance-zelo-sources">
        <h2>{t("finance.zelo.sources.label")}</h2>
        <ul>
          {providers.map((name) => {
            const state = feed.providers[name];
            const Icon = stateIcon[state];
            return (
              <li key={name} data-state={state}>
                <span>{t(`finance.zelo.providers.${name}`)}</span>
                <span className="finance-zelo-state">
                  <Icon size={14} aria-hidden="true" />
                  {t(`finance.zelo.states.${state}`)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {feed.totals.length > 0 ? (
        <div className="finance-metrics finance-zelo-totals">
          {feed.totals.map((total) => (
            <section className="finance-metric-group" key={total.currency}>
              <header>
                <h2>
                  {t("finance.zelo.totals.currency", {
                    currency: total.currency,
                  })}
                </h2>
              </header>
              <dl>
                <div className="finance-metric finance-net-primary">
                  <dt>{t("finance.zelo.net.label")}</dt>
                  <dd>
                    {total.netKnownCents === undefined
                      ? t("finance.zelo.table.unknown")
                      : money(total.netKnownCents, total.currency)}
                  </dd>
                  <dd className="finance-zelo-hint">
                    {t("finance.zelo.net.hint", {
                      count:
                        total.unknownNetCount ??
                        feed.rows.filter(
                          (row) =>
                            row.status === "paid" && row.netCents == null,
                        ).length,
                    })}
                  </dd>
                </div>
                <div className="finance-metric">
                  <dt>{t("finance.zelo.totals.received")}</dt>
                  <dd>{money(total.receivedCents, total.currency)}</dd>
                  <dd className="finance-zelo-hint">
                    {t("finance.zelo.totals.receivedHint", { month })}
                  </dd>
                </div>
                <div className="finance-metric">
                  <dt>{t("finance.zelo.totals.billed")}</dt>
                  <dd>{money(total.billedCents, total.currency)}</dd>
                  <dd className="finance-zelo-hint">
                    {t("finance.zelo.totals.billedHint", { month })}
                  </dd>
                </div>
                <div className="finance-metric">
                  <dt>{t("finance.zelo.totals.pending")}</dt>
                  <dd>{money(total.pendingCents, total.currency)}</dd>
                  <dd className="finance-zelo-hint">
                    {t("finance.zelo.totals.pendingHint", { month })}
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <p className="finance-zelo-none">
          {complete
            ? t("finance.zelo.totals.none", { month })
            : t("finance.zelo.totals.noneIncomplete")}
        </p>
      )}

      <div
        className="finance-coverage"
        data-state={complete ? "complete" : "partial"}
      >
        <div className="finance-coverage-status">
          {complete ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertTriangle size={16} aria-hidden="true" />
          )}
          <div>
            <strong>
              {complete
                ? t("finance.zelo.coverage.complete", { month })
                : t("finance.zelo.coverage.incomplete", { month })}
            </strong>
            <p>{t("finance.zelo.totals.timezone")}</p>
          </div>
        </div>
        {!complete && (
          <button
            type="button"
            className="button button-ghost"
            disabled={retryDisabled}
            onClick={onRetry}
          >
            {t("finance.zelo.coverage.retry")}
          </button>
        )}
      </div>
    </section>
  );
}

function ZeloCharges({
  feed,
  period,
  refreshing,
  provider,
  onProviderChange,
  page,
  onPageChange,
}: {
  feed: ZeloFinanceFeed;
  period: string;
  refreshing: boolean;
  provider: ProviderFilter;
  onProviderChange: (provider: ProviderFilter) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const zelo = useZeloFormat();
  const month = format.month(period);
  const feedMonth = period.slice(0, 7);
  const rows =
    provider === "all"
      ? feed.rows
      : feed.rows.filter((row) => row.provider === provider);
  const pages = Math.max(1, Math.ceil(rows.length / FINANCE_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(
    current * FINANCE_PAGE_SIZE,
    (current + 1) * FINANCE_PAGE_SIZE,
  );
  const complete = allAnswered(feed);

  const cell = (column: (typeof columns)[number], row: ZeloPayment) => {
    switch (column) {
      case "charge":
        return <code>{row.externalId}</code>;
      case "source":
        return t(`finance.zelo.providers.${row.provider}`);
      case "status":
        return (
          <span className="finance-badge" data-tone={row.status}>
            {t(`finance.zelo.status.${row.status}`)}
          </span>
        );
      case "created":
        return (
          <>
            {zelo.date(row.createdAt)}
            {civilMonth(row.createdAt) < feedMonth && (
              <small>{t("finance.zelo.table.earlier")}</small>
            )}
          </>
        );
      case "paid":
        return row.paidAt ? (
          zelo.date(row.paidAt)
        ) : (
          <span className="finance-muted">
            {t(
              row.status === "paid"
                ? "finance.zelo.table.unknown"
                : "finance.zelo.table.notPaid",
            )}
          </span>
        );
      case "billed":
        return (
          <span className="finance-amount">
            {zelo.money(row.billedCents, row.currency)}
          </span>
        );
      case "received":
        return row.receivedCents === null ? (
          <span className="finance-badge" data-tone="unknown">
            {t("finance.zelo.table.unknown")}
          </span>
        ) : (
          <span className="finance-amount">
            {zelo.money(row.receivedCents, row.currency)}
          </span>
        );
      case "fee":
        return row.feeCents == null
          ? t("finance.zelo.table.unknown")
          : zelo.money(row.feeCents, row.currency);
      case "net":
        return row.netCents == null ? (
          t("finance.zelo.table.unknown")
        ) : (
          <strong>{zelo.money(row.netCents, row.currency)}</strong>
        );
      case "available":
        return row.availableAt
          ? zelo.date(row.availableAt)
          : t("finance.zelo.table.unknown");
    }
  };

  return (
    <div className="finance-zelo-charges" aria-busy={refreshing || undefined}>
      <div className="finance-toolbar">
        <label className="finance-zelo-filter">
          <span>{t("finance.zelo.filter.provider")}</span>
          <select
            value={provider}
            onChange={(event) =>
              onProviderChange(event.target.value as ProviderFilter)
            }
          >
            <option value="all">{t("finance.zelo.filter.all")}</option>
            {providers.map((name) => (
              <option key={name} value={name}>
                {t(`finance.zelo.providers.${name}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="finance-view-hint">{t("finance.zelo.charges.hint")}</p>

      {feed.rows.length === 0 ? (
        complete ? (
          <EmptyState
            title={t("finance.zelo.empty.title", { month })}
            description={t("finance.zelo.empty.description")}
          />
        ) : (
          <EmptyState
            title={t("finance.zelo.empty.incompleteTitle")}
            description={t("finance.zelo.empty.incompleteDescription")}
          />
        )
      ) : rows.length === 0 ? (
        <EmptyState
          search
          title={t("finance.zelo.filterEmpty.title")}
          description={t("finance.zelo.filterEmpty.description")}
        />
      ) : (
        <div
          className="finance-table-region"
          data-refreshing={refreshing || undefined}
        >
          <div className="finance-table-wrap">
            {/* Explicit roles keep table semantics when phones restyle rows. */}
            <table className="finance-table" data-view="zelo" role="table">
              <caption className="sr-only">
                {t("finance.zelo.charges.title", { month })}
              </caption>
              <thead role="rowgroup">
                <tr role="row">
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      role="columnheader"
                      data-column={column}
                    >
                      {t(`finance.zelo.table.columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visible.map((row) => (
                  <tr key={`${row.provider}:${row.id}`} role="row">
                    {columns.map((column) => (
                      <td
                        key={column}
                        role="cell"
                        data-column={column}
                        data-label={t(`finance.zelo.table.columns.${column}`)}
                      >
                        {cell(column, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav
          className="finance-pagination"
          aria-label={t("finance.pagination.label")}
        >
          <button
            type="button"
            className="button button-ghost"
            disabled={current === 0}
            onClick={() => onPageChange(current - 1)}
          >
            {t("finance.previous")}
          </button>
          <span>
            {t("finance.zelo.pagination", {
              page: current + 1,
              total: pages,
            })}
          </span>
          <button
            type="button"
            className="button button-ghost"
            disabled={current >= pages - 1}
            onClick={() => onPageChange(current + 1)}
          >
            {t("finance.next")}
          </button>
        </nav>
      )}
    </div>
  );
}
