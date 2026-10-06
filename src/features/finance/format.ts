import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** Locale-aware BRL, month and civil-date formatting for finance views. */
export function useFinanceFormat() {
  const { i18n } = useTranslation("common");
  const language = i18n.language;
  return useMemo(() => {
    const currency = new Intl.NumberFormat(language, {
      style: "currency",
      currency: "BRL",
    });
    const month = new Intl.DateTimeFormat(language, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const shortMonth = new Intl.DateTimeFormat(language, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const date = new Intl.DateTimeFormat(language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const dateTime = new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const civil = (value: string) =>
      new Date(`${value.slice(0, 10)}T12:00:00Z`);
    return {
      money: (cents: number) => currency.format(cents / 100),
      month: (period: string) =>
        month.format(civil(`${period.slice(0, 7)}-01`)),
      shortMonth: (period: string) =>
        shortMonth.format(civil(`${period.slice(0, 7)}-01`)),
      date: (value: string) => date.format(civil(value)),
      dateTime: (value: string) => dateTime.format(new Date(value)),
    };
  }, [language]);
}
