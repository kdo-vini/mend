export type SupportedLocale = "en-US" | "pt-BR";

export function normalizeLocale(value: unknown): SupportedLocale {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "pt" || normalized === "pt-br" ? "pt-BR" : "en-US";
}

export function replyLanguageInstruction(locale: SupportedLocale): string {
  return locale === "pt-BR"
    ? "Write the suggested reply in Brazilian Portuguese."
    : "Write the suggested reply in US English.";
}
