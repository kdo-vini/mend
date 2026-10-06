import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { ErrorState } from "../../shared/ui/ResourceState";
import { currentMonth, monthPeriod } from "./model";
import { useFinanceData } from "./useFinanceData";
import { MonthNavigator } from "./components/MonthNavigator";
import {
  FinanceSummaryPanel,
  FinanceSummarySkeleton,
} from "./components/FinanceSummaryPanel";

/**
 * Home-page finance block: the same monthly figures as `/financeiro`, read
 * only. It requests access and summary, never ledger lists.
 */
export function FinanceOverview() {
  const { t } = useTranslation("common");
  const [month, setMonth] = useState(currentMonth);
  const period = monthPeriod(month);
  const data = useFinanceData({ period, entity: null, offset: 0 });
  const summary = data.summary;

  return (
    <section className="finance-panel" aria-labelledby="finance-overview-title">
      <header className="finance-panel-header">
        <h2 id="finance-overview-title">{t("finance.overview")}</h2>
        {data.allowed && (
          <div className="finance-panel-actions">
            <MonthNavigator month={month} onChange={setMonth} />
            <Link to="/financeiro" className="button button-ghost">
              {t("finance.open")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
      </header>
      {data.error && data.allowed !== false ? (
        <ErrorState
          title={t("finance.errors.loadTitle")}
          description={t("finance.errors.load")}
          onRetry={data.retry}
        />
      ) : data.allowed === false ? (
        <p className="finance-restricted-note">{t("finance.restricted")}</p>
      ) : summary ? (
        <FinanceSummaryPanel
          summary={summary.data}
          period={summary.period}
          refreshing={summary.period !== period || data.pending.summary}
        />
      ) : (
        <FinanceSummarySkeleton />
      )}
    </section>
  );
}
