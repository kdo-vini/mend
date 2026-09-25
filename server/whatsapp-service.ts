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
  type InboxConversationContext,
  type InboxMediaInput,
  type InboxMessageRecord,
} from "./inbox-service.js";
import {
  normalizePhoneNumber,
  resolveWhatsAppSendDestination,
  type ProviderMessage,
  type SendButtonsInput,
  type SendListInput,
  type SendReactionInput,
  type SendAudioInput,
  type SendMediaInput,
  type SendTextInput,
  type WhatsmiauGroupInfo,
} from "./whatsmiau.js";
import type { SupportFlowNode } from "../src/shared/support-flow.js";
import {
  formatChoicesAsTextFallback,
  type AiReplyChoice,
} from "./automation/reply-choices.js";

export interface WhatsAppProvider {
  /** Live session state, read back to explain why a send was refused. */
  getConnectionState?(instanceName: string): Promise<{ state?: string }>;
  getGroupInfo?(input: {
    instanceName: string;
    remoteJid: string;
  }): Promise<WhatsmiauGroupInfo | null>;
  sendPresence?(
    instanceName: string,
    number: string,
    presence?: "composing" | "recording" | "paused",
    delay?: number,
  ): Promise<unknown>;
  sendReaction?(input: SendReactionInput): Promise<unknown>;
  sendList?(
    input: SendListInput,
  ): Promise<ProviderMessage | Record<string, unknown>>;
  sendButtons?(
    input: SendButtonsInput,
  ): Promise<ProviderMessage | Record<string, unknown>>;
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
  deleteMessageForEveryone?(input: {
    instanceName: string;
    id: string;
    remoteJid: string;
    fromMe: boolean;
    participant?: string;
  }): Promise<unknown>;
}

export interface SendTextRequest {
  text: string;
  aiGenerated?: boolean;
  /** Forward a stable retry key to providers that implement deduplication. */
  idempotencyKey?: string;
  onProviderMessageId?: (providerMessageId: string) => Promise<void> | void;
}

export interface SendReplyChoicesRequest {
  text: string;
  choices: readonly AiReplyChoice[];
  title?: string;
  aiGenerated?: boolean;
  idempotencyKey?: string;
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

export type OutboundSendReason =
  | "channel_disconnected"
  | "provider_rejected"
  | "provider_unavailable"
  | "provider_timeout";

/**
 * A delivery failure the operator can act on. Every provider fault used to
 * reach the API as an unclassified error and surface as a generic internal
 * error, which told the operator nothing: a dropped WhatsApp session and a
 * message the provider refused need opposite responses. This carries the
 * distinction to the route layer.
 */
export class OutboundSendError extends Error {
  constructor(
    readonly reason: OutboundSendReason,
    readonly providerError?: unknown,
  ) {
    super(`outbound_send_${reason}`);
    this.name = "OutboundSendError";
  }
}

/** Provider faults worth another attempt: timeouts, throttling and outages. */
function retryableProviderFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return false;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function connectedState(state: string | undefined): boolean {
  const value = (state ?? "").toLowerCase();
  return value === "open" || value === "connected";
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

/** The number WhatsApp resolved the send to, when the provider reports one. */
function providerRemoteJid(value: unknown): string | undefined {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const candidates = [
    asRecord(root.key).remoteJid,
    asRecord(data.key).remoteJid,
  ];
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
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

function outboundDestination(conversation: InboxConversationContext): string {
  return resolveWhatsAppSendDestination({
    phoneNumber: conversation.phoneNumber,
    remoteJid: conversation.remoteJid,
  });
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

  /**
   * Turns a provider send fault into a reason the operator can act on. The
   * provider answers 4xx both for a message it refused and for an instance
   * whose WhatsApp session has dropped, and the stored channel status is only
   * refreshed on demand, so the live session state is read back before the
   * message gets the blame.
   */
  private async sendFailure(
    instanceName: string,
    error: unknown,
  ): Promise<OutboundSendError> {
    if (error instanceof OutboundSendError) return error;
    if (error instanceof Error && error.name === "AbortError")
      return new OutboundSendError("provider_timeout", error);
    const state = this.provider.getConnectionState
      ? await this.provider
          .getConnectionState(instanceName)
          .catch(() => undefined)
      : undefined;
    if (state && !connectedState(state.state))
      return new OutboundSendError("channel_disconnected", error);
    return new OutboundSendError(
      retryableProviderFailure(error)
        ? "provider_unavailable"
        : "provider_rejected",
      error,
    );
  }

  /** Runs one provider send, classifying any fault before it leaves this port. */
  private async delivering<T>(
    instanceName: string,
    send: () => Promise<T>,
  ): Promise<T> {
    try {
      return await send();
    } catch (error) {
      throw await this.sendFailure(instanceName, error);
    }
  }

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
    const destination = outboundDestination(conversation);
    if (this.provider.sendPresence)
      await this.provider
        .sendPresence(conversation.providerInstanceName, destination)
        .catch(() => undefined);
    const response = await this.delivering(
      conversation.providerInstanceName,
      () =>
        this.provider.sendText({
          instanceName: conversation.providerInstanceName,
          number: destination,
          text,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
        }),
    );
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

  /**
   * Sends a clarification as WhatsApp reply buttons (≤3) when the provider
   * supports them; otherwise falls back to numbered plain text.
   */
  async sendReplyChoices(
    context: InboxContext,
    conversationId: string,
    input: SendReplyChoicesRequest,
  ): Promise<OutboundResult> {
    const text = input.text.trim();
    if (!text || text.length > 20_000) throw new Error("message_text_invalid");
    const choices = input.choices.slice(0, 3);
    if (choices.length < 2)
      return this.sendText(context, conversationId, {
        text,
        aiGenerated: input.aiGenerated,
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
        ...(input.onProviderMessageId
          ? { onProviderMessageId: input.onProviderMessageId }
          : {}),
      });

    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    const destination = outboundDestination(conversation);
    const title = (input.title?.trim() || "Escolha uma opção").slice(0, 60);
    const visibleText = formatChoicesAsTextFallback(text, choices);

    if (this.provider.sendPresence)
      await this.provider
        .sendPresence(conversation.providerInstanceName, destination)
        .catch(() => undefined);

    let response: unknown;
    try {
      if (choices.length <= 3 && this.provider.sendButtons) {
        response = await this.delivering(
          conversation.providerInstanceName,
          () =>
            this.provider.sendButtons!({
              instanceName: conversation.providerInstanceName,
              number: destination,
              title,
              description: text,
              buttons: choices.map((choice) => ({
                type: "reply" as const,
                displayText: choice.label,
                id: choice.id,
              })),
            }),
        );
      } else if (this.provider.sendList) {
        response = await this.delivering(
          conversation.providerInstanceName,
          () =>
            this.provider.sendList!({
              instanceName: conversation.providerInstanceName,
              number: destination,
              title,
              description: text,
              buttonText: "Ver opções",
              sections: [
                {
                  title,
                  rows: choices.map((choice) => ({
                    rowId: choice.id,
                    title: choice.label,
                  })),
                },
              ],
            }),
        );
      } else {
        return this.sendText(context, conversationId, {
          text: visibleText,
          aiGenerated: input.aiGenerated,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
          ...(input.onProviderMessageId
            ? { onProviderMessageId: input.onProviderMessageId }
            : {}),
        });
      }
    } catch (error) {
      // Provider may reject interactive payloads on some accounts — fall back.
      if (error instanceof OutboundSendError)
        return this.sendText(context, conversationId, {
          text: visibleText,
          aiGenerated: input.aiGenerated,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
          ...(input.onProviderMessageId
            ? { onProviderMessageId: input.onProviderMessageId }
            : {}),
        });
      throw error;
    }

    const id = providerMessageId(response);
    await input.onProviderMessageId?.(id);
    const message = await this.inbox.recordOutbound(context, conversationId, {
      providerMessageId: id,
      messageType: "text",
      text: visibleText,
      aiGenerated: input.aiGenerated,
    });
    return { message, providerMessageId: id };
  }

  /**
   * First message to a phone number that has no conversation yet. Sends first
   * and records afterwards, the same ordering sendText uses, so the contact,
   * conversation and message are created by the RPC that handles inbound.
   */
  async startConversation(
    context: InboxContext,
    input: {
      channelConnectionId: string;
      instanceName: string;
      phoneNumber: string;
      text: string;
    },
  ): Promise<InboxMessageRecord> {
    const text = input.text.trim();
    if (!text || text.length > 20_000) throw new Error("message_text_invalid");
    const response = await this.delivering(input.instanceName, () =>
      this.provider.sendText({
        instanceName: input.instanceName,
        number: input.phoneNumber,
        text,
      }),
    );
    // Record the number WhatsApp resolved, not the digits that were typed: a
    // Brazilian mobile answers on both the 8- and 9-digit forms, and the
    // customer's reply arrives at the webhook under the resolved JID. Recording
    // the typed form would let that reply create a second contact and
    // conversation, splitting the thread this endpoint exists to keep whole.
    const remoteJid =
      providerRemoteJid(response) ?? `${input.phoneNumber}@s.whatsapp.net`;
    return this.inbox.persistNormalizedMessage(
      context,
      input.channelConnectionId,
      {
        instanceName: input.instanceName,
        providerMessageId: providerMessageId(response),
        remoteJid,
        phoneNumber: normalizePhoneNumber(remoteJid) || input.phoneNumber,
        direction: "outbound",
        messageType: "text",
        text,
        chatType: "direct",
        raw: {},
      },
    );
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
    const destination = outboundDestination(conversation);
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
      response = await this.delivering(conversation.providerInstanceName, () =>
        this.provider.sendAudio({
          instanceName: conversation.providerInstanceName,
          number: destination,
          audio: value,
        }),
      );
    } else {
      response = await this.delivering(conversation.providerInstanceName, () =>
        this.provider.sendMedia({
          instanceName: conversation.providerInstanceName,
          number: destination,
          mediatype: type,
          media: value,
          caption: input.caption,
          fileName:
            input.fileName ??
            ("fileName" in media ? media.fileName : undefined),
        }),
      );
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

  async sendReaction(
    context: InboxContext,
    conversationId: string,
    input: { providerMessageId: string; fromMe: boolean; reaction: string },
  ): Promise<InboxMessageRecord | null> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    if (!this.provider.sendReaction)
      throw new Error("whatsmiau_reaction_not_supported");
    const reaction = input.reaction.trim();
    if (reaction.length > 16) throw new Error("reaction_invalid");
    const response = await this.provider.sendReaction({
      instanceName: conversation.providerInstanceName,
      remoteJid: conversation.remoteJid,
      id: input.providerMessageId,
      fromMe: input.fromMe,
      reaction,
    });
    if (!reaction) return null;
    const id = providerMessageId(response) || `reaction-${randomUUID()}`;
    return this.inbox.recordOutbound(context, conversationId, {
      providerMessageId: id,
      messageType: "reaction",
      text: reaction,
      quotedProviderMessageId: input.providerMessageId,
    });
  }

  async sendPresence(
    context: InboxContext,
    conversationId: string,
    presence: "composing" | "recording" | "paused" = "composing",
  ): Promise<void> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    if (!this.provider.sendPresence)
      throw new Error("whatsmiau_presence_not_supported");
    await this.provider.sendPresence(
      conversation.providerInstanceName,
      outboundDestination(conversation),
      presence,
      3_000,
    );
  }

  async sendFlowNode(
    context: InboxContext,
    conversationId: string,
    node: SupportFlowNode,
  ): Promise<InboxMessageRecord> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    const destination = outboundDestination(conversation);
    const visibleText =
      node.type === "menu"
        ? `${node.message}\n\n${node.options
            .map((option, index) => `${index + 1}. ${option.label}`)
            .join("\n")}`
        : node.message;
    let response: unknown;
    if (
      node.type === "menu" &&
      node.options.length <= 3 &&
      this.provider.sendButtons
    ) {
      response = await this.provider.sendButtons({
        instanceName: conversation.providerInstanceName,
        number: destination,
        title: node.title,
        description: node.message,
        buttons: node.options.map((option) => ({
          type: "reply" as const,
          displayText: option.label,
          id: option.id,
        })),
      });
    } else if (node.type === "menu" && this.provider.sendList) {
      response = await this.provider.sendList({
        instanceName: conversation.providerInstanceName,
        number: destination,
        title: node.title,
        description: node.message,
        buttonText: "Ver opções",
        sections: [
          {
            title: node.title,
            rows: node.options.map((option) => ({
              rowId: option.id,
              title: option.label,
            })),
          },
        ],
      });
    } else {
      response = await this.provider.sendText({
        instanceName: conversation.providerInstanceName,
        number: destination,
        text: visibleText,
      });
    }
    return this.inbox.recordOutbound(context, conversationId, {
      providerMessageId: providerMessageId(response),
      messageType: "text",
      text: visibleText,
    });
  }

  async deleteMessageForEveryone(
    context: InboxContext,
    conversationId: string,
    input: { id: string; fromMe: boolean; participant?: string },
  ): Promise<void> {
    const conversation = await this.inbox.getConversation(
      context,
      conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    if (!this.provider.deleteMessageForEveryone)
      throw new Error("whatsmiau_message_delete_not_supported");
    await this.provider.deleteMessageForEveryone({
      instanceName: conversation.providerInstanceName,
      id: input.id,
      remoteJid: conversation.remoteJid,
      fromMe: input.fromMe,
      ...(input.participant ? { participant: input.participant } : {}),
    });
  }
}

export function createWhatsAppService(
  inbox: InboxService,
  provider: WhatsAppProvider,
  mediaStorage?: MediaStorage,
) {
  return new WhatsAppService(inbox, provider, mediaStorage);
}
