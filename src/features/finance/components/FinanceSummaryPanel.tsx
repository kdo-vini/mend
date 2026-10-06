import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FinanceSummary } from "../api";
import { coverageGaps } from "../model";
import { useFinanceFormat } from "../format";

function Metric({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone?: "negative";
}) {
  const format = useFinanceFormat();
  return (
    <div className="finance-metric" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{format.money(cents)}</dd>
    </div>
  );
}

/**
 * Month figures grouped by meaning: accrual (what belongs to the month) and
 * cash (what moved in the month), followed by an explicit coverage status.
 */
export function FinanceSummaryPanel({
  summary,
  period,
  refreshing,
  showCoverage = true,
}: {
  summary: FinanceSummary;
  period: string;
  refreshing: boolean;
  showCoverage?: boolean;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const result = summary.income - summary.expenses;
  const gaps = coverageGaps(summary);
  const month = format.month(period);
  return (
    <section
      className="finance-summary"
      aria-label={t("finance.summaryLabel", { month })}
      aria-busy={refreshing || undefined}
      data-refreshing={refreshing || undefined}
    >
      <div className="finance-metrics">
        <section className="finance-metric-group">
          <header>
            <h2>{t("finance.accrual.title")}</h2>
            <p>{t("finance.accrual.hint", { month })}</p>
          </header>
          <dl>
            <Metric label={t("finance.income")} cents={summary.income} />
            <Metric label={t("finance.expenses")} cents={summary.expenses} />
            <Metric
              label={t("finance.result")}
              cents={result}
              tone={result < 0 ? "negative" : undefined}
            />
          </dl>
        </section>
        <section className="finance-metric-group">
          <header>
            <h2>{t("finance.cash.title")}</h2>
            <p>{t("finance.cash.hint", { month })}</p>
          </header>
          <dl>
            <Metric label={t("finance.received")} cents={summary.received} />
            <Metric label={t("finance.paid")} cents={summary.paid} />
          </dl>
        </section>
      </div>
      {!showCoverage && (
        <p
          className="finance-summary-validity"
          data-state={gaps.length ? "partial" : "complete"}
        >
          {t(gaps.length ? "finance.partial" : "finance.complete")}
        </p>
      )}
      {showCoverage && (
        <div
          className="finance-coverage"
          data-state={gaps.length ? "partial" : "complete"}
        >
          <div className="finance-coverage-status">
            {gaps.length ? (
              <AlertTriangle size={16} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={16} aria-hidden="true" />
            )}
            <div>
              <strong>
                {t(gaps.length ? "finance.partial" : "finance.complete")}
              </strong>
              {gaps.length > 0 && (
                <ul>
                  {gaps.map((gap) => (
                    <li key={gap}>
                      {t(`finance.gaps.${gap}`, {
                        count:
                          gap === "estimated"
                            ? summary.estimated_count
                            : gap === "unknown"
                              ? summary.unknown_count
                              : gap === "references"
                                ? summary.reference_pending
                                : 0,
                      })}
                    </li>
                  ))}
                </ul>
              )}
              <p>{t("finance.notBalance")}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function FinanceSummarySkeleton() {
  const { t } = useTranslation("common");
  return (
    <div
      className="finance-summary finance-summary-skeleton"
      role="status"
      aria-label={t("finance.loading")}
    >
      <div className="finance-metrics">
        {[3, 2].map((count, group) => (
          <div className="finance-metric-group" key={group}>
            <span className="skeleton finance-skeleton-title" />
            <div className="finance-skeleton-row">
              {Array.from({ length: count }, (_, index) => (
                <span
                  key={index}
                  className="skeleton finance-skeleton-metric"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
