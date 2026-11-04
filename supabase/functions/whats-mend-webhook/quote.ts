/**
 * Quoted-message and connection-state helpers for the edge webhook.
 * Keep in sync with `resolveQuotedProviderMessageId` in server/whatsmiau.ts;
 * the edge function cannot import server modules.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * The provider puts quote info at `data.contextInfo` (quotedMessage has no
 * `key`; the quoted id is `stanzaId`). Baileys-style payloads nest it under
 * `extendedTextMessage.contextInfo`, and older ones use `quotedMessage.key.id`.
 */
export function resolveQuotedProviderMessageId(
  value: JsonRecord,
  message: JsonRecord,
): string | undefined {
  const topContext = asRecord(value.contextInfo);
  const extendedContext = asRecord(
    asRecord(message.extendedTextMessage).contextInfo,
  );
  const quoted = asRecord(
    extendedContext.quotedMessage ?? topContext.quotedMessage,
  );
  return text(
    topContext.stanzaId,
    extendedContext.stanzaId,
    asRecord(quoted.key).id,
    asRecord(asRecord(message.reactionMessage).key).id,
  );
}

const CONNECTION_STATES = ["open", "closed", "connecting", "qr-code"];

/** Maps the provider's `close` to `closed` and drops unknown states. */
export function normalizeConnectionState(raw: unknown): string | undefined {
  const value = text(raw);
  const state = value === "close" ? "closed" : value;
  return state && CONNECTION_STATES.includes(state) ? state : undefined;
}
