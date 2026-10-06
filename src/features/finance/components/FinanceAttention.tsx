import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import type { FinanceAttentionFilter, FinanceSummary } from "../api";
import { coverageGaps, type LedgerView } from "../model";
import { useFinanceFormat } from "../format";

/** Deterministic coverage checks, never an AI verdict or a bank balance. */
export function FinanceAttention({
  summary,
  period,
  disabled,
  onReview,
  onView,
  onResolve,
}: {
  summary: FinanceSummary;
  period: string;
  disabled: boolean;
  onReview: () => void;
  onView: (view: LedgerView) => void;
  onResolve: (filter: FinanceAttentionFilter) => void;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const gaps = coverageGaps(summary);
  return (
    <section
      className="finance-attention"
      aria-labelledby="finance-attention-title"
    >
      <header>
        <div>
          <h2 id="finance-attention-title" tabIndex={-1}>
            <ListChecks size={18} aria-hidden="true" />
            {t("finance.attention.title")}
          </h2>
          <p>
            {t("finance.attention.source", { month: format.month(period) })}
          </p>
        </div>
        <span className="finance-attention-count">
          {t("finance.attention.checks", { count: gaps.length })}
        </span>
        {gaps.length > 0 && !gaps.includes("review") && (
          <button
            type="button"
            className="button button-ghost"
            disabled={disabled}
            onClick={onReview}
          >
            {t("finance.review")}
          </button>
        )}
      </header>
      {gaps.length ? (
        <ul>
          {gaps.map((gap) => (
            <li key={gap}>
              <span className="finance-attention-dot" aria-hidden="true" />
              <div>
                <strong>
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
                </strong>
                <p>{t(`finance.attention.hints.${gap}`)}</p>
              </div>
              <button
                type="button"
                className="button button-ghost"
                disabled={disabled}
                onClick={() =>
                  gap === "review"
                    ? onReview()
                    : gap === "references"
                      ? onView("settlements")
                      : onResolve(gap)
                }
              >
                {t(
                  gap === "review"
                    ? "finance.review"
                    : gap === "references"
                      ? "finance.attention.payments"
                      : gap === "unknown"
                        ? "finance.pending.resolveUnknown"
                        : "finance.pending.resolveEstimated",
                )}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="finance-attention-complete">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>{t("finance.attention.complete")}</strong>
            <p>{t("finance.attention.completeHint")}</p>
          </div>
          <button
            type="button"
            className="button button-ghost"
            disabled={disabled}
            onClick={onReview}
          >
            {t("finance.review")}
          </button>
        </div>
      )}
      <p className="finance-attention-footnote">{t("finance.notBalance")}</p>
    </section>
  );
}
