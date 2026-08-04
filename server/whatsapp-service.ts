import { randomUUID } from "node:crypto";
import {
  buildMediaStoragePath,
  type MediaStorage,
  type RemoteMediaReference,
  type ValidatedMedia,
} from "./media.js";
import {
  InboxService,
  normalizeOutboundMedia,
  type InboxContext,
  type InboxMediaInput,
  type InboxMessageRecord,
} from "./inbox-service.js";
import type {
  ProviderMessage,
  SendAudioInput,
  SendMediaInput,
  SendTextInput,
} from "./whatsmiau.js";

export interface WhatsAppProvider {
  sendPresence?(instanceName: string, number: string): Promise<unknown>;
  sendText(
    input: SendTextInput,
  ): Promise<ProviderMessage | Record<string, unknown>>;
  sendMedia(
    input: SendMediaInput,
  ): Promise<ProviderMessage | Record<string, unknown>>;
  sendAudio(
    input: SendAudioInput,
  ): Promise<ProviderMessage | Record<string, unknown>>;
  markAsRead(
    instanceName: string,
    remoteJid: string,
    providerMessageId: string,
  ): Promise<unknown>;
}

export interface SendTextRequest {
  text: string;
  aiGenerated?: boolean;
  onProviderMessageId?: (providerMessageId: string) => Promise<void> | void;
}

export interface SendMediaRequest {
  media: InboxMediaInput;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  /** Existing private-media path used when the provider receives a temporary signed URL. */
  mediaStoragePathOverride?: string;
  aiGenerated?: boolean;
}

export interface OutboundResult {
  message: InboxMessageRecord;
  providerMessageId: string;
  mediaStoragePath?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerMessageId(value: unknown): string {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const key = asRecord(root.key);
  const dataKey = asRecord(data.key);
  const candidates = [
    key.id,
    dataKey.id,
    root.messageId,
    data.messageId,
    root.id,
    data.id,
  ];
  const id = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return id?.slice(0, 500) ?? `client-${randomUUID()}`;
}

function mediaTypeFor(input: {
  mediaType?: SendMediaRequest["mediaType"];
  mimeType?: string;
}): NonNullable<SendMediaRequest["mediaType"]> {
  if (input.mediaType) return input.mediaType;
  const mime = input.mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function providerMediaValue(
  media: ValidatedMedia | RemoteMediaReference,
  signedUrl?: string,
): string {
  if (signedUrl) return signedUrl;
  if ("url" in media) return media.url;
  return `data:${media.mimeType};base64,${Buffer.from(media.data).toString("base64")}`;
}

/** Provider boundary for outbound messages and provider read receipts. */
export class WhatsAppService {
  constructor(
    private readonly inbox: InboxService,
    private readonly provider: WhatsAppProvider,
    private readonly mediaStorage?: MediaStorage,
  ) {}

  async sendText(
    context: InboxContext,
    conversationId: string,
    input: SendTextRequest,
  ): Promise<OutboundResult> {
    const text = input.text.trim();
    if (!text || text.length > 20_000) throw new Error("message_text_invalid");
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    if (this.provider.sendPresence)
      await this.provider
        .sendPresence(
          conversation.providerInstanceName,
          conversation.phoneNumber,
        )
        .catch(() => undefined);
    const response = await this.provider.sendText({
      instanceName: conversation.providerInstanceName,
      number: conversation.phoneNumber,
      text,
    });
    const id = providerMessageId(response);
    await input.onProviderMessageId?.(id);
    const message = await this.inbox.recordOutbound(context, conversationId, {
      providerMessageId: id,
      messageType: "text",
      text,
      aiGenerated: input.aiGenerated,
    });
    return { message, providerMessageId: id };
  }

  async sendMedia(
    context: InboxContext,
    conversationId: string,
    input: SendMediaRequest,
  ): Promise<OutboundResult> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    const media = normalizeOutboundMedia(
      input.media,
      input.mimeType,
      input.fileName ?? "file",
    );
    const type = mediaTypeFor({
      mediaType: input.mediaType,
      mimeType: "mimeType" in media ? media.mimeType : input.mimeType,
    });
    let storagePath: string | undefined;
    let signedUrl: string | undefined;
    if (!("url" in media)) {
      if (!this.mediaStorage) throw new Error("media_storage_not_configured");
      storagePath = buildMediaStoragePath(
        context.workspaceId,
        conversationId,
        media,
      );
      await this.mediaStorage.upload(storagePath, media);
      signedUrl = await this.mediaStorage.createSignedUrl(storagePath, 900);
    }
    const value = providerMediaValue(media, signedUrl);
    let response: ProviderMessage | Record<string, unknown>;
    if (type === "audio") {
      response = await this.provider.sendAudio({
        instanceName: conversation.providerInstanceName,
        number: conversation.phoneNumber,
        audio: value,
      });
    } else {
      response = await this.provider.sendMedia({
        instanceName: conversation.providerInstanceName,
        number: conversation.phoneNumber,
        mediatype: type,
        media: value,
        caption: input.caption,
        fileName:
          input.fileName ?? ("fileName" in media ? media.fileName : undefined),
      });
    }
    const id = providerMessageId(response);
    const message = await this.inbox.recordOutbound(context, conversationId, {
      providerMessageId: id,
      messageType: type,
      caption: input.caption,
      mediaStoragePath: input.mediaStoragePathOverride ?? storagePath,
      mediaRemoteUrl:
        input.mediaStoragePathOverride || storagePath
          ? undefined
          : "url" in media
            ? media.url
            : undefined,
      mimeType: "mimeType" in media ? media.mimeType : input.mimeType,
      fileName: "fileName" in media ? media.fileName : input.fileName,
      fileSize: "size" in media ? media.size : undefined,
      aiGenerated: input.aiGenerated,
    });
    return {
      message,
      providerMessageId: id,
      ...(storagePath ? { mediaStoragePath: storagePath } : {}),
    };
  }

  async markRead(context: InboxContext, conversationId: string): Promise<void> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    const latest = await this.inbox.latestInbound(context, conversationId);
    if (latest)
      await this.provider.markAsRead(
        conversation.providerInstanceName,
        latest.remoteJid,
        latest.providerMessageId,
      );
    await this.inbox.readConversation(context, conversationId);
  }
}

export function createWhatsAppService(
  inbox: InboxService,
  provider: WhatsAppProvider,
  mediaStorage?: MediaStorage,
) {
  return new WhatsAppService(inbox, provider, mediaStorage);
}
