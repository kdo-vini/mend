import { appLocale } from "../../i18n/resources";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function timeOf(date: Date) {
  return new Intl.DateTimeFormat(appLocale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "2 nov" or "3 set 2025": the locale's own short month, no "de". */
function shortDate(date: Date, now: Date) {
  const parts = new Intl.DateTimeFormat(appLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value.replace(/\./g, "") ?? "";
  const base = `${pick("day")} ${pick("month")}`;
  return date.getFullYear() === now.getFullYear()
    ? base
    : `${base} ${pick("year")}`;
}

function isYesterday(date: Date, now: Date) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return sameDay(date, yesterday);
}

/** "hoje, 09:42", "ontem", "2 nov" or "3 set 2025". */
export function formatUpdated(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const relative = new Intl.RelativeTimeFormat(appLocale, { numeric: "auto" });
  if (sameDay(date, now))
    return `${relative.format(0, "day")}, ${timeOf(date)}`;
  if (isYesterday(date, now)) return relative.format(-1, "day");
  return shortDate(date, now);
}

/** Like `formatUpdated`, but older days keep the time ("28 out, 08:05"). */
export function formatMoment(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now) || isYesterday(date, now))
    return isYesterday(date, now)
      ? `${formatUpdated(iso, now)}, ${timeOf(date)}`
      : formatUpdated(iso, now);
  return `${shortDate(date, now)}, ${timeOf(date)}`;
}
