import {
  SupabaseSupportEventStore,
  type StoredSupportEvent,
  type SupportEvent,
  type SupportEventStore,
} from "./support-events.js";

/**
 * B2 push: after a new Support event is recorded, POST it to the Support
 * bot's automation webhook so it wakes without polling. The GET poll route
 * stays as the debugging/backfill path.
 */
export const SUPPORT_WEBHOOK_URL_ENV = "MEND_SUPPORT_WEBHOOK_URL";
export const SUPPORT_WEBHOOK_AUTHORIZATION_ENV =
  "MEND_SUPPORT_WEBHOOK_AUTHORIZATION";

const DEFAULT_TIMEOUT_MS = 4_000;

export interface SupportWebhookConfig {
  url: string;
  authorization?: string;
}

export interface SupportWebhookNotifier {
  /** Never throws: WhatsApp ingest must continue when the webhook fails. */
  notify(row: StoredSupportEvent): Promise<void>;
}

export interface SupportWebhookLogger {
  warn(bindings: Record<string, unknown>, message: string): void;
}

/** Accept the full header value (`Bearer …`) or just the token. */
export function normalizeSupportWebhookAuthorization(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^bearer\s+/i.test(trimmed)
    ? `Bearer ${trimmed.replace(/^bearer\s+/i, "")}`
    : `Bearer ${trimmed}`;
}

/** Null (push disabled) unless an http(s) URL is configured. */
export function resolveSupportWebhookConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupportWebhookConfig | null {
  const url = env[SUPPORT_WEBHOOK_URL_ENV]?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
  } catch {
    return null;
  }
  const authorization = normalizeSupportWebhookAuthorization(
    env[SUPPORT_WEBHOOK_AUTHORIZATION_ENV],
  );
  return { url, ...(authorization ? { authorization } : {}) };
}

/** POST one event; throws on non-2xx or timeout. At-most-once, no retries. */
export async function postSupportEvent(
  config: SupportWebhookConfig,
  event: SupportEvent,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<void> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(config.authorization ? { Authorization: config.authorization } : {}),
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`support_webhook_status_${response.status}`);
}

export interface SupportWebhookNotifierOptions {
  store: Pick<SupportEventStore, "hydrate">;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  timeoutMs?: number;
  logger?: SupportWebhookLogger;
}

/** Null when the webhook URL is unset, so the worker skips push entirely. */
export function createSupportWebhookNotifier(
  options: SupportWebhookNotifierOptions,
): SupportWebhookNotifier | null {
  const config = resolveSupportWebhookConfig(options.env);
  if (!config) return null;
  return {
    async notify(row) {
      try {
        const [event] = await options.store.hydrate([row]);
        if (!event) return;
        await postSupportEvent(config, event, {
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.timeoutMs !== undefined
            ? { timeoutMs: options.timeoutMs }
            : {}),
        });
      } catch (error) {
        // Log ids only: never the URL, token or message text.
        options.logger?.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            messageId: row.messageId,
            conversationId: row.conversationId,
          },
          "Support webhook push failed",
        );
      }
    },
  };
}

/**
 * Wrap a store so each newly recorded event is pushed once; duplicate records
 * (null) never push. Record errors still throw so the ingest job retries.
 */
export function withSupportWebhook(
  store: Pick<SupportEventStore, "record" | "hydrate">,
  options: Omit<SupportWebhookNotifierOptions, "store"> = {},
): Pick<SupportEventStore, "record"> {
  const notifier = createSupportWebhookNotifier({ ...options, store });
  if (!notifier) return store;
  return {
    async record(input) {
      const recorded = await store.record(input);
      if (recorded) await notifier.notify(recorded);
      return recorded;
    },
  };
}

/** Production worker store: Supabase queue plus the B2 webhook push. */
export function supabaseSupportEventsWithWebhook(
  client: unknown,
  logger?: SupportWebhookLogger,
): Pick<SupportEventStore, "record"> {
  return withSupportWebhook(
    SupabaseSupportEventStore.from(client),
    logger ? { logger } : {},
  );
}
