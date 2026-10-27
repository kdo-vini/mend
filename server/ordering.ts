const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque compound keyset cursor over (sort key, id). */
export function encodeKeysetCursor(key: string | number, id: string): string {
  return Buffer.from(JSON.stringify([key, id])).toString("base64url");
}

export type KeysetCursor =
  | { kind: "keyset"; key: string | number; id: string }
  | { kind: "legacy"; id: string };

/**
 * Decodes an opaque cursor. A bare uuid is a legacy id-only cursor: the caller
 * resolves its sort key with one lookup. Anything else is rejected (null).
 */
export function decodeKeysetCursor(cursor: string): KeysetCursor | null {
  if (UUID_PATTERN.test(cursor)) return { kind: "legacy", id: cursor };
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      (typeof value[0] === "string" ||
        (typeof value[0] === "number" && Number.isFinite(value[0]))) &&
      typeof value[1] === "string" &&
      UUID_PATTERN.test(value[1])
    )
      return { kind: "keyset", key: value[0], id: value[1] };
  } catch {
    // Not an encoded cursor.
  }
  return null;
}

/**
 * completed_at only changes on a status transition: set when entering done
 * (keeping an existing stamp when already done), cleared when leaving it.
 */
export function completedAtFor(
  nextStatus: string,
  current: { status?: unknown; completed_at?: unknown } | null | undefined,
  now: string,
): string | null {
  if (nextStatus !== "done") return null;
  return current?.status === "done" && typeof current.completed_at === "string"
    ? current.completed_at
    : now;
}

/** Cursor for the page after `items`, or undefined when the page was not full. */
export function nextKeysetCursor(
  items: unknown,
  limit: number,
  keyOf: (item: Record<string, unknown>) => string | number | null | undefined,
): string | undefined {
  if (!Array.isArray(items) || items.length < limit || !items.length)
    return undefined;
  const last = items[items.length - 1] as Record<string, unknown>;
  const key = keyOf(last);
  return key == null || typeof last.id !== "string"
    ? undefined
    : encodeKeysetCursor(key, last.id);
}
