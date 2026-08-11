export type MessageDayLabel =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "date"; value: string };

type DateParts = { year: number; month: number; day: number };

function browserLocale() {
  return typeof navigator !== "undefined" && navigator.language
    ? navigator.language
    : "pt-BR";
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function parseMessageDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(date: Date, timeZone = browserTimeZone()): DateParts {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    return {
      year: Number(parts.find((part) => part.type === "year")?.value),
      month: Number(parts.find((part) => part.type === "month")?.value),
      day: Number(parts.find((part) => part.type === "day")?.value),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }
}

function dayOrdinal(parts: DateParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function getMessageDayKey(
  value: string | undefined,
  timeZone = browserTimeZone(),
) {
  const date = parseMessageDate(value);
  if (!date) return null;
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getMessageDayLabel(
  value: string | undefined,
  now = new Date(),
  locale = browserLocale(),
  timeZone = browserTimeZone(),
): MessageDayLabel | null {
  const date = parseMessageDate(value);
  if (!date) return null;

  const difference =
    (dayOrdinal(dateParts(now, timeZone)) -
      dayOrdinal(dateParts(date, timeZone))) /
    (24 * 60 * 60 * 1000);
  if (difference === 0) return { kind: "today" };
  if (difference === 1) return { kind: "yesterday" };

  return {
    kind: "date",
    value: formatMessageDate(date, locale, timeZone),
  };
}

function formatMessageDate(
  date: Date,
  locale = browserLocale(),
  timeZone = browserTimeZone(),
) {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...(timeZone ? { timeZone } : {}),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
}

export function formatMessageTime(
  value: string | undefined,
  fallback: string,
  locale = browserLocale(),
  timeZone = browserTimeZone(),
) {
  const date = parseMessageDate(value);
  if (!date) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      ...(timeZone ? { timeZone } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return fallback;
  }
}
