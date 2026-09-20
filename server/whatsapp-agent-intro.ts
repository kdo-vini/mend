import { normalizeLocale, type SupportedLocale } from "./locale.js";

/** First token of a display name, e.g. "Lucas Silva" → "Lucas". */
export function agentFirstName(displayName: string): string {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.split(" ")[0] ?? trimmed;
}

/**
 * Full attending phrase with WhatsApp bold+italic on the entire line.
 * Must be exactly `_*…*_` — never `*Name* …` (name-only bold).
 */
export function agentAttendingLine(
  agentName: string,
  locale: SupportedLocale = "pt-BR",
): string {
  const name = agentFirstName(agentName);
  if (!name) return "";
  const phrase =
    locale === "en-US"
      ? `${name} is assisting you`
      : `${name} está te atendendo`;
  // Outer italic (_), inner bold (*): whole phrase is italic + bold.
  return `_*${phrase}*_`;
}

/** Previous format that bolded only the agent name — rewrite on sight. */
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

/**
 * If the body already starts with a name-only-bold intro, replace that prefix
 * with the current whole-phrase italic+bold intro.
 */
function upgradeLegacyIntroPrefix(
  text: string,
  agentName: string,
  locale: SupportedLocale,
): string | null {
  const legacy = legacyAgentAttendingLine(agentName, locale);
  if (!legacy || !text.startsWith(legacy)) return null;
  const intro = agentAttendingLine(agentName, locale);
  return `${intro}${text.slice(legacy.length)}`;
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
  const resolvedLocale = normalizeLocale(locale);
  if (options?.includeIntro === false) {
    // Strip a leftover intro if a retry body still carries one.
    const intro = agentAttendingLine(agentName, resolvedLocale);
    const legacy = legacyAgentAttendingLine(agentName, resolvedLocale);
    if (intro && text.startsWith(intro))
      return text.slice(intro.length).replace(/^\n+/, "").trim() || text;
    if (legacy && text.startsWith(legacy))
      return text.slice(legacy.length).replace(/^\n+/, "").trim() || text;
    return text;
  }
  const intro = agentAttendingLine(agentName, resolvedLocale);
  if (!intro) return text;
  const upgraded = upgradeLegacyIntroPrefix(text, agentName, resolvedLocale);
  if (upgraded) return upgraded;
  if (text.startsWith(intro)) return text;
  return `${intro}\n\n${text}`;
}
