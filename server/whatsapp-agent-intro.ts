import { normalizeLocale, type SupportedLocale } from "./locale.js";

/** First token of a display name, e.g. "Lucas Silva" → "Lucas". */
export function agentFirstName(displayName: string): string {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.split(" ")[0] ?? trimmed;
}

export function agentAttendingLine(
  agentName: string,
  locale: SupportedLocale = "pt-BR",
): string {
  const name = agentFirstName(agentName);
  if (!name) return "";
  return locale === "en-US"
    ? `*${name}* is assisting you`
    : `*${name}* está te atendendo`;
}

/**
 * Prefixes a human WhatsApp reply with the attending-agent intro so the
 * customer sees who is responding above the message body.
 */
export function formatHumanWhatsAppText(
  agentName: string,
  body: string,
  locale: SupportedLocale | string = "pt-BR",
): string {
  const text = body.trim();
  if (!text) return text;
  const resolvedLocale = normalizeLocale(locale);
  const intro = agentAttendingLine(agentName, resolvedLocale);
  if (!intro) return text;
  // Retries and drafts that already include the intro must not stack it.
  if (text.startsWith(intro)) return text;
  return `${intro}\n\n${text}`;
}
