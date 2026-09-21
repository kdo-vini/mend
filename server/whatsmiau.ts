import { createHash } from "node:crypto";
import {
  publicProviderMediaUrl,
  readProviderMessageContent,
} from "./whatsmiau-message.js";

export interface MessagingInstance {
  instanceName: string;
  state: string;
  phoneNumber?: string;
  /** Browser-ready PNG data URI when the provider returned a pairing QR. */
  qrcode?: string;
  pairingCode?: string;
}
export interface ConnectionState {
  state: "open" | "closed" | "connecting" | "qr-code" | string;
  suspended?: boolean;
}
export interface ProviderMessage {
  /**
   * `remoteJid` is the number WhatsApp actually resolved the send to, which can
   * differ from the digits a human typed (a Brazilian mobile is reachable with
   * and without the ninth digit). Optional: not every provider response carries
   * it.
   */
  key?: { id?: string; remoteJid?: string };
  message?: Record<string, unknown>;
}

export interface WhatsmiauGroupInfo {
  id: string;
  subject: string;
}
export interface CreateInstanceInput {
  instanceName: string;
  /**
   * Whatsmiau Cloud create schema does not document a `qrcode` flag. Pairing
   * happens via `/instance/connect` after create. Kept optional for Evolution
   * compatibility only when explicitly requested.
   */
  qrcode?: boolean;
  /**
   * Full history sync needs a paid Whatsmiau history slot. Default is off so
   * create/pair still works on plans without free slots.
   */
  syncFullHistory?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}
export interface SendTextInput {
  instanceName: string;
  number: string;
  text: string;
  delay?: number;
  /** Stable key for providers that support retry-safe outbound delivery. */
  idempotencyKey?: string;
}
export interface SendMediaInput {
  instanceName: string;
  number: string;
  mediatype: "image" | "video" | "document";
  media: string;
  caption?: string;
  fileName?: string;
}
export interface SendAudioInput {
  instanceName: string;
  number: string;
  audio: string;
}
export interface DeleteMessageInput {
  instanceName: string;
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
}
export interface SendReactionInput {
  instanceName: string;
  remoteJid: string;
  id: string;
  fromMe: boolean;
  reaction: string;
}
export interface SendListInput {
  instanceName: string;
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{ title: string; description?: string; rowId: string }>;
  }>;
}
export interface SendButtonsInput {
  instanceName: string;
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: Array<{ type: "reply"; displayText: string; id: string }>;
}
export interface ConfigureWebhookInput {
  instanceName: string;
  url: string;
  secret: string;
}

export type NormalizedMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "reaction";

export interface NormalizedWhatsmiauMessage {
  instanceName: string;
  providerMessageId: string;
  remoteJid: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  messageType: NormalizedMessageType;
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  quotedProviderMessageId?: string;
  interactionId?: string;
  providerTimestamp?: string;
  contactName?: string;
  chatType?: "direct" | "group";
  participantName?: string;
  raw: Record<string, unknown>;
}

export class WhatsmiauApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "WhatsmiauApiError";
  }

  get retryable() {
    return (
      this.status === 408 ||
      this.status === 425 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}

type RequestInitWithBody = RequestInit & { body?: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const stringValue = (...values: unknown[]) =>
  values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
const numberValue = (...values: unknown[]) =>
  values.find(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

/** Normalize provider QR payloads into a browser-ready PNG data URI. */
export function asWhatsAppQrDataUri(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

/**
 * Whatsmiau/Evolution may return the pairing QR as a string, a nested
 * `{ base64 }` object, a top-level `base64` field, or wrapped under `data`.
 * Pairing must read all of these shapes or Settings shows an empty placeholder.
 */
export function extractWhatsmiauConnectQr(result: unknown): {
  qrcode?: string;
  pairingCode?: string;
} {
  const root = asRecord(result);
  const wrapped = asRecord(root.data);
  const record =
    Object.keys(wrapped).length > 0 ? { ...root, ...wrapped } : root;
  const nested = asRecord(record.qrcode);
  const raw = stringValue(
    typeof record.qrcode === "string" ? record.qrcode : undefined,
    nested.base64,
    record.base64,
    wrapped.base64,
  );
  const pairingCode = stringValue(
    record.pairingCode,
    record.pairing_code,
    nested.pairingCode,
  );
  return {
    ...(raw ? { qrcode: asWhatsAppQrDataUri(raw) } : {}),
    ...(pairingCode ? { pairingCode } : {}),
  };
}

export function normalizeMessagingInstance(
  result: unknown,
  fallbackName: string,
): MessagingInstance {
  const root = asRecord(result);
  const nested = asRecord(root.instance);
  const qr = extractWhatsmiauConnectQr(result);
  const phoneNumber = stringValue(
    root.phoneNumber,
    root.owner,
    nested.phoneNumber,
    nested.owner,
  );
  return {
    instanceName:
      stringValue(root.instanceName, nested.instanceName, fallbackName) ??
      fallbackName,
    state:
      stringValue(root.state, nested.state, nested.status, root.status) ??
      "closed",
    ...(phoneNumber ? { phoneNumber } : {}),
    ...qr,
  };
}

export function normalizePhoneNumber(value: string): string {
  return value
    .replace(/^\+/, "")
    .replace(/@[^/]+$/, "")
    .replace(/\D/g, "");
}

/** Provider send target: digits for DMs, full `{id}@g.us` JID for group chats. */
export function resolveWhatsAppSendDestination(input: {
  phoneNumber: string;
  remoteJid?: string;
}): string {
  const remoteJid = input.remoteJid?.trim() ?? "";
  if (remoteJid.endsWith("@g.us")) return remoteJid;
  const number = input.phoneNumber.trim();
  if (number.endsWith("@g.us")) return number;
  return normalizePhoneNumber(number || remoteJid);
}

function stableMessageId(
  instanceName: string,
  event: string,
  value: Record<string, unknown>,
): string {
  const key = asRecord(value.key);
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        instanceName,
        event,
        remoteJid: key.remoteJid ?? value.remoteJid,
        timestamp: value.messageTimestamp ?? value.timestamp,
        message: value.message,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `generated-${digest}`;
}

function unwrapMessages(
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  const data = payload.data;
  if (Array.isArray(data))
    return data.map(asRecord).filter((value) => Object.keys(value).length > 0);
  const dataRecord = asRecord(data);
  if (Array.isArray(dataRecord.messages))
    return dataRecord.messages
      .map(asRecord)
      .filter((value) => Object.keys(value).length > 0);
  return [dataRecord].filter((value) => Object.keys(value).length > 0);
}

/** Converts the current Whatsmiau/Baileys webhook shapes into one DB-safe message shape. */
export function normalizeWhatsmiauEvent(
  input: unknown,
  fallbackInstanceName = "",
): NormalizedWhatsmiauMessage[] {
  const payload = asRecord(input);
  const event = stringValue(payload.event, payload.type) ?? "messages.upsert";
  const instanceName =
    stringValue(payload.instance, payload.instanceName, payload.name) ??
    fallbackInstanceName;
  if (!instanceName) return [];

  return unwrapMessages(payload).flatMap((value) => {
    const key = asRecord(value.key);
    const content = readProviderMessageContent(value);
    const message = content.message;
    const remoteJid =
      stringValue(key.remoteJid, value.remoteJid, value.chatId) ?? "";
    const providerMessageId =
      stringValue(key.id, value.id, value.messageId, value.keyId) ??
      stableMessageId(instanceName, event, value);
    if (!remoteJid || !providerMessageId) return [];
    const extended = asRecord(message.extendedTextMessage);
    const quoted = asRecord(extended.contextInfo).quotedMessage;
    const quotedProviderMessageId = stringValue(
      asRecord(asRecord(quoted).key).id,
      asRecord(asRecord(message.reactionMessage).key).id,
    );
    const timestamp = numberValue(value.messageTimestamp, value.timestamp);
    const timestampMs =
      timestamp && timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const listResponse = asRecord(
      asRecord(message.listResponseMessage).singleSelectReply,
    );
    const buttonResponse = asRecord(message.buttonsResponseMessage);
    const interactionId = stringValue(
      listResponse.selectedRowId,
      buttonResponse.selectedButtonId,
    );
    const mediaUrl = publicProviderMediaUrl(...content.mediaUrlCandidates);
    const fromMe = key.fromMe === true || value.fromMe === true;
    const chatType = remoteJid.endsWith("@g.us") ? "group" : "direct";
    const contactName = stringValue(
      value.pushName,
      value.notifyName,
      value.contactName,
    );

    return [
      {
        instanceName,
        providerMessageId,
        remoteJid,
        phoneNumber: normalizePhoneNumber(remoteJid),
        direction: fromMe ? "outbound" : "inbound",
        messageType: content.messageType,
        ...(content.text ? { text: content.text } : {}),
        ...(content.caption ? { caption: content.caption } : {}),
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(content.mimeType ? { mimeType: content.mimeType } : {}),
        ...(content.fileName ? { fileName: content.fileName } : {}),
        ...(content.fileSize !== undefined
          ? { fileSize: content.fileSize }
          : {}),
        ...(content.durationSeconds !== undefined
          ? { durationSeconds: content.durationSeconds }
          : {}),
        ...(quotedProviderMessageId ? { quotedProviderMessageId } : {}),
        ...(interactionId ? { interactionId } : {}),
        ...(timestampMs
          ? { providerTimestamp: new Date(timestampMs).toISOString() }
          : {}),
        ...(contactName ? { contactName } : {}),
        chatType,
        ...(chatType === "group" && contactName
          ? { participantName: contactName }
          : {}),
        raw: value,
      },
    ];
  });
}

export class WhatsmiauMessagingProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly groupInfoCache = new Map<
    string,
    { expiresAt: number; value: WhatsmiauGroupInfo }
  >();

  constructor(
    baseUrl = process.env.WHATSMIAU_BASE_URL ?? "https://api.whatsmiau.dev/v2",
    apiKey = process.env.WHATSMIAU_API_KEY ?? "",
    private readonly timeoutMs = Number(
      process.env.WHATSMIAU_TIMEOUT_MS ?? 15_000,
    ),
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    init: RequestInitWithBody = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: this.apiKey,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const body = await response.text();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new WhatsmiauApiError(
          `Whatsmiau request failed: ${response.status}`,
          response.status,
          body,
          Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
        );
      }
      if (!body) return undefined as T;
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new WhatsmiauApiError(
          `Whatsmiau request failed: invalid JSON (${response.status})`,
          response.status,
          body.slice(0, 300),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  listInstances() {
    return this.request<MessagingInstance[]>("/instance/fetchInstances");
  }
  async createInstance(input: CreateInstanceInput) {
    const instanceName = input.instanceName.trim();
    const payload: Record<string, unknown> = { instanceName };
    // Only send optional flags when explicitly requested. Whatsmiau Cloud's
    // create schema does not list `qrcode`, and `syncFullHistory` needs a paid
    // history slot — sending them by default caused create to fail with 400.
    if (input.qrcode === true) payload.qrcode = true;
    if (input.syncFullHistory === true) payload.syncFullHistory = true;
    const raw = await this.request<unknown>("/instance/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // Webhook setup must not roll back a freshly created instance. Pairing/QR
    // can proceed without inbound events; ensureWebhook repairs the hook later.
    if (input.webhookUrl && input.webhookSecret) {
      try {
        await this.configureWebhook({
          instanceName,
          url: input.webhookUrl,
          secret: input.webhookSecret,
        });
      } catch {
        // Best-effort: keep the instance so Settings can still show a QR.
      }
    }
    return normalizeMessagingInstance(raw, instanceName);
  }
  async connectInstance(instanceName: string) {
    const result = await this.request<unknown>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
    return extractWhatsmiauConnectQr(result);
  }
  /**
   * Polls the PNG endpoint briefly. After create/connect the QR is often not
   * ready on the first image request; returning null immediately left Settings
   * with an empty placeholder.
   */
  async getQrCode(instanceName: string, attempts = 1, delayMs = 0) {
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
      if (attempt > 0 && delayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      const response = await fetch(
        `${this.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}/image`,
        { headers: { apikey: this.apiKey } },
      );
      // 204 = already connected (no QR).
      if (response.status === 204) return null;
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 0) return buffer;
    }
    return null;
  }
  deleteInstance(instanceName: string) {
    return this.request<void>(
      `/instance/delete/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" },
    );
  }
  async getConnectionState(instanceName: string): Promise<ConnectionState> {
    const raw = await this.request<unknown>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
    const root = asRecord(raw);
    const nested = asRecord(root.instance);
    const state =
      stringValue(root.state, nested.state, nested.status, root.status) ??
      "closed";
    return {
      state,
      ...(root.suspended === true || nested.suspended === true
        ? { suspended: true }
        : {}),
    };
  }
  async getGroupInfo(input: {
    instanceName: string;
    remoteJid: string;
  }): Promise<WhatsmiauGroupInfo | null> {
    if (!input.remoteJid.endsWith("@g.us")) return null;
    const cacheKey = `${input.instanceName}:${input.remoteJid}`;
    const cached = this.groupInfoCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await this.request<Record<string, unknown>>(
      `/group/findGroupInfos/${encodeURIComponent(input.instanceName)}?groupJid=${encodeURIComponent(input.remoteJid)}`,
    );
    const group = asRecord(result.group ?? result);
    const subject = stringValue(group.subject)?.trim().slice(0, 240);
    const id = stringValue(group.id) ?? input.remoteJid;
    if (!subject) return null;
    const value = { id, subject };
    this.groupInfoCache.set(cacheKey, {
      expiresAt: Date.now() + 60 * 60 * 1000,
      value,
    });
    return value;
  }
  configureWebhook(input: ConfigureWebhookInput) {
    const url = new URL(input.url);
    if (!["http:", "https:"].includes(url.protocol) || !input.secret)
      throw new Error("invalid_webhook_configuration");
    // Whatsmiau persists custom headers but currently omits them when delivering
    // webhook requests. The Edge Function accepts the same secret as a path
    // segment so callbacks remain authenticated.
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(input.secret)}`;
    return this.request<void>(
      `/webhook/set/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: url.toString(),
            events: [
              "messages.upsert",
              "messages.update",
              "messages.delete",
              "messages.set",
              "connection.update",
              "contacts.upsert",
            ],
            headers: { Authorization: `Bearer ${input.secret}` },
            byEvents: false,
            base64: false,
          },
        }),
      },
    );
  }
  sendText(input: SendTextInput) {
    return this.request<ProviderMessage>(
      `/message/sendText/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        ...(input.idempotencyKey
          ? { headers: { "idempotency-key": input.idempotencyKey } }
          : {}),
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: input.number,
            remoteJid: input.number,
          }),
          text: input.text,
          delay: input.delay,
        }),
      },
    );
  }
  sendMedia(input: SendMediaInput) {
    return this.request<ProviderMessage>(
      `/message/sendMedia/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: input.number,
            remoteJid: input.number,
          }),
          mediatype: input.mediatype,
          media: input.media,
          caption: input.caption,
          fileName: input.fileName,
        }),
      },
    );
  }
  sendAudio(input: SendAudioInput) {
    return this.request<ProviderMessage>(
      `/message/sendWhatsAppAudio/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: input.number,
            remoteJid: input.number,
          }),
          audio: input.audio,
        }),
      },
    );
  }
  sendPresence(
    instanceName: string,
    number: string,
    presence: "composing" | "recording" | "paused" = "composing",
    delay = 1_200,
  ) {
    return this.request<void>(
      `/chat/sendPresence/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: number,
            remoteJid: number,
          }),
          presence,
          type: "text",
          delay,
        }),
      },
    );
  }
  markAsRead(instanceName: string, remoteJid: string, id: string) {
    return this.request<void>(
      `/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({ readMessages: [{ remoteJid, id }] }),
      },
    );
  }
  deleteMessageForEveryone(input: DeleteMessageInput) {
    return this.request<void>(
      `/chat/deleteMessageForEveryone/${encodeURIComponent(input.instanceName)}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          id: input.id,
          remoteJid: input.remoteJid,
          fromMe: input.fromMe,
          ...(input.participant ? { participant: input.participant } : {}),
        }),
      },
    );
  }
  sendReaction(input: SendReactionInput) {
    return this.request<void>(
      `/message/sendReaction/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          reaction: input.reaction,
          key: {
            remoteJid: input.remoteJid,
            id: input.id,
            fromMe: input.fromMe,
          },
        }),
      },
    );
  }
  sendList(input: SendListInput) {
    return this.request<ProviderMessage>(
      `/message/sendList/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: input.number,
            remoteJid: input.number,
          }),
          title: input.title,
          description: input.description,
          buttonText: input.buttonText,
          footerText: input.footerText,
          sections: input.sections,
        }),
      },
    );
  }
  sendButtons(input: SendButtonsInput) {
    return this.request<ProviderMessage>(
      `/message/sendButtons/${encodeURIComponent(input.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: resolveWhatsAppSendDestination({
            phoneNumber: input.number,
            remoteJid: input.number,
          }),
          title: input.title,
          description: input.description,
          footer: input.footer,
          buttons: input.buttons,
        }),
      },
    );
  }
  disconnect(instanceName: string) {
    return this.request<void>(
      `/instance/logout/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" },
    );
  }
}
