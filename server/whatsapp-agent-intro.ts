import { normalizeLocale, type SupportedLocale } from "./locale.js";

/** First token of a display name, e.g. "Lucas Silva" → "Lucas". */
export function agentFirstName(displayName: string): string {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.split(" ")[0] ?? trimmed;
}

/**
 * WhatsApp markdown: italic + bold around the whole attending phrase
 * (`_*Name is assisting you*_`).
 */
export function agentAttendingLine(
  agentName: string,
  locale: SupportedLocale = "pt-BR",
): string {
  const name = agentFirstName(agentName);
  if (!name) return "";
  return locale === "en-US"
    ? `_*${name} is assisting you*_`
    : `_*${name} está te atendendo*_`;
}

/** Previous format that bolded only the agent name. */
function legacyAgentAttendingLine(
  agentName: string,
  locale: SupportedLocale,
): string {
  const name = agentFirstName(agentName);
  if (!name) return "";
  return locale === "en-US"
    ? `*${name}* is assisting you`
    : `*${name}* está te atendendo`;
}

function textAlreadyHasIntro(
  text: string,
  agentName: string,
  locale: SupportedLocale,
): boolean {
  const intro = agentAttendingLine(agentName, locale);
  const legacy = legacyAgentAttendingLine(agentName, locale);
  return (
    (Boolean(intro) && text.startsWith(intro)) ||
    (Boolean(legacy) && text.startsWith(legacy))
  );
}

/**
 * Prefixes a human WhatsApp reply with the attending-agent intro so the
 * customer sees who is responding above the message body. Callers must pass
 * `includeIntro: false` after the first human outbound in the conversation.
 */
export function formatHumanWhatsAppText(
  agentName: string,
  body: string,
  locale: SupportedLocale | string = "pt-BR",
  options?: { includeIntro?: boolean },
): string {
  const text = body.trim();
  if (!text) return text;
  if (options?.includeIntro === false) return text;
  const resolvedLocale = normalizeLocale(locale);
  const intro = agentAttendingLine(agentName, resolvedLocale);
  if (!intro) return text;
  // Retries and drafts that already include the intro must not stack it.
  if (textAlreadyHasIntro(text, agentName, resolvedLocale)) return text;
  return `${intro}\n\n${text}`;
}
