import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonth, shiftMonth } from "../model";
import { useFinanceFormat } from "../format";

export function MonthNavigator({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const id = useId();
  const today = currentMonth();
  return (
    <div
      className="finance-month"
      role="group"
      aria-label={t("finance.monthNavigation")}
    >
      <button
        type="button"
        className="icon-button"
        aria-label={t("finance.previousMonth", {
          month: format.month(shiftMonth(month, -1)),
        })}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <label htmlFor={id} className="sr-only">
        {t("finance.month")}
      </label>
      <input
        id={id}
        type="month"
        value={month}
        required
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={t("finance.nextMonth", {
          month: format.month(shiftMonth(month, 1)),
        })}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {month !== today && (
        <button
          type="button"
          className="button button-ghost"
          onClick={() => onChange(today)}
        >
          {t("finance.thisMonth")}
        </button>
      )}
    </div>
  );
}
