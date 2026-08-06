import { createHash } from "node:crypto";

export interface MessagingInstance {
  instanceName: string;
  state: string;
  phoneNumber?: string;
}
export interface ConnectionState {
  state: "open" | "closed" | "connecting" | "qr-code" | string;
  suspended?: boolean;
}
export interface ProviderMessage {
  key?: { id?: string };
  message?: Record<string, unknown>;
}

export interface WhatsmiauGroupInfo {
  id: string;
  subject: string;
}
export interface CreateInstanceInput {
  instanceName: string;
  qrcode?: boolean;
  syncFullHistory?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}
export interface SendTextInput {
  instanceName: string;
  number: string;
  text: string;
  delay?: number;
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
const firstRecord = (...values: unknown[]) =>
  values.map(asRecord).find((value) => Object.keys(value).length > 0) ?? {};
const stringValue = (...values: unknown[]) =>
  values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
const numberValue = (...values: unknown[]) =>
  values.find(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

function publicMediaUrl(...values: unknown[]): string | undefined {
  const value = stringValue(...values);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizePhoneNumber(value: string): string {
  return value
    .replace(/^\+/, "")
    .replace(/@[^/]+$/, "")
    .replace(/\D/g, "");
}

function messageType(message: Record<string, unknown>): NormalizedMessageType {
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.reactionMessage) return "reaction";
  return "text";
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
    const message = asRecord(value.message);
    const content = firstRecord(
      message.imageMessage,
      message.videoMessage,
      message.audioMessage,
      message.documentMessage,
      message.reactionMessage,
    );
    const remoteJid =
      stringValue(key.remoteJid, value.remoteJid, value.chatId) ?? "";
    const providerMessageId =
      stringValue(key.id, value.id, value.messageId, value.keyId) ??
      stableMessageId(instanceName, event, value);
    if (!remoteJid || !providerMessageId) return [];
    const type = messageType(message);
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
    const text = stringValue(
      message.conversation,
      extended.text,
      content.caption,
      asRecord(message.reactionMessage).text,
      listResponse.title,
      buttonResponse.selectedDisplayText,
    );
    const mediaUrl = publicMediaUrl(
      value.mediaUrl,
      content.url,
      content.directPath,
      content.mediaUrl,
      asRecord(value.media).url,
    );
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
        messageType: type,
        ...(text ? { text } : {}),
        ...(stringValue(content.caption)
          ? { caption: stringValue(content.caption) }
          : {}),
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(stringValue(content.mimetype, content.mimeType)
          ? { mimeType: stringValue(content.mimetype, content.mimeType) }
          : {}),
        ...(stringValue(content.fileName, content.filename)
          ? { fileName: stringValue(content.fileName, content.filename) }
          : {}),
        ...(numberValue(content.fileLength, content.fileSize)
          ? { fileSize: numberValue(content.fileLength, content.fileSize) }
          : {}),
        ...(numberValue(content.seconds, content.duration)
          ? { durationSeconds: numberValue(content.seconds, content.duration) }
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
      return JSON.parse(body) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  listInstances() {
    return this.request<MessagingInstance[]>("/instance/fetchInstances");
  }
  async createInstance(input: CreateInstanceInput) {
    const instance = await this.request<MessagingInstance>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: input.instanceName,
        qrcode: input.qrcode ?? true,
        syncFullHistory: input.syncFullHistory ?? true,
      }),
    });
    // Creating the instance and configuring its webhook are two provider calls.
    // Do not leave an orphaned provider instance when the second call fails.
    if (input.webhookUrl && input.webhookSecret) {
      try {
        await this.configureWebhook({
          instanceName: input.instanceName,
          url: input.webhookUrl,
          secret: input.webhookSecret,
        });
      } catch (error) {
        await this.disconnect(input.instanceName).catch(() => undefined);
        throw error;
      }
    }
    return instance;
  }
  connectInstance(instanceName: string) {
    return this.request<{ qrcode?: string; pairingCode?: string }>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
  }
  getQrCode(instanceName: string) {
    return fetch(
      `${this.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}/image`,
      { headers: { apikey: this.apiKey } },
    ).then((response) =>
      response.ok
        ? response.arrayBuffer().then((value) => Buffer.from(value))
        : null,
    );
  }
  getConnectionState(instanceName: string) {
    return this.request<ConnectionState>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
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
        body: JSON.stringify({
          number: normalizePhoneNumber(input.number),
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
          number: normalizePhoneNumber(input.number),
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
          number: normalizePhoneNumber(input.number),
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
          number: normalizePhoneNumber(number),
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
          number: normalizePhoneNumber(input.number),
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
          number: normalizePhoneNumber(input.number),
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
