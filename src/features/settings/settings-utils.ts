export function formatSettingsDate(value?: string | null) {
  if (!value) return "Not verified";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function providerLabel(provider: string) {
  return provider === "openai"
    ? "ChatGPT / Codex"
    : provider === "anthropic"
      ? "Claude"
      : provider === "google"
        ? "Gemini"
        : "Verboo";
}
