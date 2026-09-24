import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Machine path Outbound/Grok Bot calls on Mend. Matches the ZeloChat contract. */
export const OUTBOUND_WHATSAPP_PATH = "/internal/whatsapp/send-text";

/** Dedicated Mend API key header. Do not reuse MEND_API_TOKEN or the Chat key. */
export const OUTBOUND_WHATSAPP_KEY_HEADER = "x-mend-outbound-key";

/** Header ZeloChat already accepts for Techne server-to-server send. */
export const ZELOCHAT_INTERNAL_KEY_HEADER = "x-zelochat-internal-key";

export const OUTBOUND_WHATSAPP_API_KEY_ENV = "MEND_OUTBOUND_WHATSAPP_API_KEY";
export const ZELOCHAT_BASE_URL_ENV = "ZELOCHAT_BASE_URL";
export const ZELOCHAT_INTERNAL_API_KEY_ENV = "ZELOCHAT_INTERNAL_API_KEY";
export const ZELOCHAT_INTERNAL_API_KEY_LEGACY_ENV = "TECHNE_INTERNAL_API_KEY";

const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_TIMEOUT_MS = 15_000;

export const outboundWhatsAppBodySchema = z
  .object({
    to: z.string().trim().min(1).max(64),
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  })
  .strict();

export type OutboundWhatsAppBody = z.infer<typeof outboundWhatsAppBodySchema>;

export interface ZeloChatForwardConfig {
  baseUrl: string;
  apiKey: string;
}

export interface AuthorizeOutboundResult {
  ok: boolean;
  status: 200 | 401 | 503;
  error?: string;
}

export interface ForwardZeloChatResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ForwardZeloChatInput extends OutboundWhatsAppBody {
  idempotencyKey?: string;
}

/**
 * Hash both sides so length differences do not short-circuit the compare.
 * Fail-closed: a missing configured secret never authenticates.
 */
export function timingSafeSecretEquals(
  received: string | undefined,
  expected: string | undefined,
): boolean {
  if (!received || !expected) return false;
  const left = createHash("sha256").update(received, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function readOutboundWhatsAppApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env[OUTBOUND_WHATSAPP_API_KEY_ENV]?.trim() ?? "";
  return value ? value : null;
}

export function readZeloChatForwardConfig(
  env: NodeJS.ProcessEnv = process.env,
): ZeloChatForwardConfig | null {
  const baseUrl = env[ZELOCHAT_BASE_URL_ENV]?.trim().replace(/\/$/, "") ?? "";
  const apiKey =
    env[ZELOCHAT_INTERNAL_API_KEY_ENV]?.trim() ||
    env[ZELOCHAT_INTERNAL_API_KEY_LEGACY_ENV]?.trim() ||
    "";
  if (!baseUrl || !apiKey) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
  } catch {
    return null;
  }
  return { baseUrl, apiKey };
}

/**
 * Dedicated outbound key. Missing env is 503 (fail-closed), not 401.
 * A 401 here always means the caller presented the wrong Mend key.
 */
export function authorizeOutboundWhatsAppRequest(
  receivedKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AuthorizeOutboundResult {
  const expected = readOutboundWhatsAppApiKey(env);
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "outbound_key_not_configured",
    };
  }
  if (!timingSafeSecretEquals(receivedKey?.trim(), expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true, status: 200 };
}

/**
 * Same recipient rules as ZeloChat Techne send: E.164-ish BR digits or a
 * WhatsApp user JID. Invalid numbers are rejected here so Mend never forwards.
 */
export function isValidOutboundWhatsAppRecipient(to: string): boolean {
  const value = to.trim();
  if (/^\d{10,15}@s\.whatsapp\.net$/i.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  if (!digits) return false;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return withCountry.length >= 12 && withCountry.length <= 13;
}

export function parseOutboundWhatsAppBody(
  value: unknown,
): { ok: true; data: OutboundWhatsAppBody } | { ok: false; error: string } {
  const parsed = outboundWhatsAppBodySchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (!isValidOutboundWhatsAppRecipient(parsed.data.to)) {
    return { ok: false, error: "invalid_to" };
  }
  return { ok: true, data: parsed.data };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Pass through the ZeloChat contract fields Outbound already consumes.
 * Drop providerBody and any other raw payload that might carry internals.
 */
export function sanitizeZeloChatResponse(
  status: number,
  payload: unknown,
): ForwardZeloChatResult {
  const record = asRecord(payload) ?? {};
  const error = pickString(record, "error");
  const message = pickString(record, "message");
  if (status === 401) {
    return {
      status: 503,
      body: { error: "zelochat_forward_unauthorized" },
    };
  }
  const body: Record<string, unknown> = {};
  if (record.ok === true) body.ok = true;
  const to = pickString(record, "to");
  const messageId = pickString(record, "messageId");
  const jobId = pickString(record, "jobId");
  const sendStatus = pickString(record, "status");
  if (to) body.to = to;
  if (messageId) body.messageId = messageId;
  if (jobId) body.jobId = jobId;
  if (sendStatus) body.status = sendStatus;
  if (error) body.error = error;
  if (message) body.message = message;
  if (!error && status >= 400) body.error = "zelochat_forward_failed";
  return { status, body };
}

export async function forwardZeloChatSendText(
  input: ForwardZeloChatInput,
  config: ZeloChatForwardConfig,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<ForwardZeloChatResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      [ZELOCHAT_INTERNAL_KEY_HEADER]: config.apiKey,
      accept: "application/json",
    };
    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    const response = await fetchImpl(
      `${config.baseUrl}${OUTBOUND_WHATSAPP_PATH}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ to: input.to, message: input.message }),
        signal: controller.signal,
      },
    );
    const rawText = await response.text();
    let payload: unknown = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as unknown;
      } catch {
        payload = { error: "zelochat_forward_failed" };
      }
    }
    return sanitizeZeloChatResponse(response.status, payload);
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      status: 502,
      body: {
        error: aborted ? "zelochat_timeout" : "zelochat_unavailable",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
