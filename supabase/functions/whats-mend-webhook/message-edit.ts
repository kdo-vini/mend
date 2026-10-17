/**
 * Reads a Whatsmiau `messages.edited` payload. Kept free of Deno imports so
 * server tests can exercise it. `key` points at the ORIGINAL message and
 * `editedMessage` carries the new content.
 */
import { readProviderMessageContent } from "./message-content.ts";

export interface ProviderMessageEdit {
  providerMessageId: string;
  text: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (...values: unknown[]): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

export function extractProviderMessageEdit(
  payload: Record<string, unknown>,
): ProviderMessageEdit | null {
  const data = asRecord(payload.data);
  const providerMessageId = stringValue(asRecord(data.key).id, data.id)?.trim();
  if (!providerMessageId) return null;
  const edited = asRecord(data.editedMessage);
  // Some providers nest the new content as `{ message: { ... } }`.
  const nested = asRecord(edited.message);
  const content = readProviderMessageContent({
    message: Object.keys(nested).length > 0 ? nested : edited,
    messageType: data.messageType,
  });
  // The docs do not describe media edits; without readable text there is
  // nothing safe to overwrite.
  if (!content.text) return null;
  return { providerMessageId, text: content.text };
}
