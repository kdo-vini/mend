import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useFinanceFormat } from "../format";

const monthFields = new Set(["period", "starts_on", "ends_on"]);

/** Human rendering of a stored finance field value (history, conflicts). */
export function useFinanceValue() {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  return useCallback(
    (field: string, value: unknown) => {
      if (value === null || value === undefined || value === "")
        return field === "amount_cents"
          ? t("finance.status.unknown")
          : t("finance.history.empty");
      if (field === "amount_cents") return format.money(Number(value));
      if (typeof value === "boolean")
        return t(value ? "finance.yes" : "finance.no");
      if (field === "kind") return t(`finance.kinds.${String(value)}`);
      if (monthFields.has(field)) return format.month(String(value));
      if (field === "paid_on") return format.date(String(value));
      return String(value);
    },
    [t, format],
  );
}
