import { appLocale } from "../../i18n/resources";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function formatActivityTime(value: unknown) {
  if (typeof value !== "string" || !value) return "Horário desconhecido";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(appLocale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export function identityInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "—"
  );
}
