import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMediaStoragePath,
  fetchRemoteMedia,
  parseMediaInput,
  type MediaStorage,
  type RemoteMediaReference,
  type ValidatedMedia,
} from "./media.js";
import {
  normalizePhoneNumber,
  type NormalizedMessageType,
  type NormalizedWhatsmiauMessage,
} from "./whatsmiau.js";

export type InboxActorType = "contact" | "user" | "ai" | "system";
export type ConversationAction = "read" | "unread" | "snooze" | "resolve";
export type EvidenceKind = "text" | "message" | "file" | "link";

export interface InboxContext {
  workspaceId: string;
  actorUserId?: string;
  actorType?: Exclude<InboxActorType, "contact">;
}

export interface InboxConversationContext {
  id: string;
  workspaceId: string;
  channelConnectionId: string;
  providerInstanceName: string;
  remoteJid: string;
  phoneNumber: string;
  contactId: string;
  contactName: string;
  status: string;
}

export interface InboxMessageRecord {
  id: string;
  workspaceId: string;
  conversationId: string;
  contactId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  messageType: NormalizedMessageType;
  unreadCount: number;
  inserted: boolean;
  mediaStoragePath?: string;
  providerStatus?: string | null;
  isDeleted?: boolean;
}

export interface PersistMessageOptions {
  mediaStoragePath?: string;
  aiGenerated?: boolean;
}

export interface ProviderMessageUpdate {
  workspaceId: string;
  channelConnectionId: string;
  providerMessageId: string;
  providerStatus?: string;
  isDeleted?: boolean;
}

export interface InboxIngestPortInput {
  workspaceId: string;
  channelConnectionId: string;
  phoneNumber: string;
  displayName?: string;
  providerContactId?: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  senderType: InboxActorType;
  messageType: NormalizedMessageType;
  text?: string;
  caption?: string;
  mediaStoragePath?: string;
  mediaRemoteUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  quotedProviderMessageId?: string;
  providerTimestamp?: string;
  aiGenerated?: boolean;
  sentByUserId?: string;
  actorType: InboxActorType;
  actorUserId?: string;
  timelineKey: string;
  metadata: Record<string, unknown>;
}

export interface InboxIngestPortResult {
  id: string;
  workspaceId: string;
  conversationId: string;
  contactId: string;
  providerMessageId: string;
  unreadCount: number;
  inserted: boolean;
}

export interface ConversationStateRecord {
  id: string;
  workspaceId: string;
  status: string;
  attentionState: string;
  unreadCount: number;
  lastReadAt?: string | null;
  snoozedUntil?: string | null;
  resolvedAt?: string | null;
}

export interface LatestInboundRecord {
  providerMessageId: string;
  remoteJid: string;
  providerTimestamp?: string;
}

export interface EvidenceInput {
  kind: EvidenceKind;
  label: string;
  body?: string;
  messageId?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface EvidenceRecord {
  id: string;
  workspaceId: string;
  issueId: string;
  messageId?: string | null;
}

/**
 * The persistence boundary used by InboxService. The fake in the tests and
 * SupabaseInboxPort below implement the same contract, so webhook handlers do
 * not need to know whether they are running against Postgres or a fake.
 */
export interface InboxPort {
  ingestMessage(input: InboxIngestPortInput): Promise<InboxIngestPortResult>;
  getConversationContext(
    workspaceId: string,
    conversationId: string,
  ): Promise<InboxConversationContext | null>;
  getLatestInbound(
    workspaceId: string,
    conversationId: string,
  ): Promise<LatestInboundRecord | null>;
  updateProviderMessage?(
    input: ProviderMessageUpdate,
  ): Promise<InboxMessageRecord | null>;
  setConversationState(input: {
    workspaceId: string;
    conversationId: string;
    action: ConversationAction;
    snoozedUntil?: string;
    actorUserId?: string;
    timelineKey: string;
    metadata: Record<string, unknown>;
  }): Promise<ConversationStateRecord>;
  attachMessageMedia(input: {
    workspaceId: string;
    messageId: string;
    storagePath: string;
    mimeType?: string;
    fileName?: string;
    sizeBytes?: number;
  }): Promise<void>;
  linkIssueMessage(input: {
    workspaceId: string;
    issueId: string;
    messageId: string;
    actorUserId?: string;
    timelineKey: string;
    metadata: Record<string, unknown>;
  }): Promise<{ inserted: boolean }>;
  createEvidence(input: {
    workspaceId: string;
    issueId: string;
    actorUserId?: string;
    evidence: EvidenceInput;
    timelineKey: string;
    metadata: Record<string, unknown>;
  }): Promise<EvidenceRecord>;
  getMediaPath(input: {
    workspaceId: string;
    messageId?: string;
    evidenceId?: string;
  }): Promise<string | null>;
  createNotification(input: {
    workspaceId: string;
    userId?: string;
    kind: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    dedupeKey?: string;
  }): Promise<void>;
}

const sensitiveKey =
  /(token|secret|password|authorization|cookie|raw|payload|body|text|phone|jid|media.?url)/i;
const safeWorkspacePart = (value: string, name: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160)
    throw new Error(`${name}_required`);
  return normalized;
};

/** Removes message content, phone numbers, provider URLs and credentials from operational metadata. */
export function redactTimelineMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!value) return {};
  const safeEntries: Array<[string, unknown]> = [];
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey.test(key)) continue;
    if (typeof item === "string") safeEntries.push([key, item.slice(0, 160)]);
    else if (
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    )
      safeEntries.push([key, item]);
  }
  return Object.fromEntries(safeEntries);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerStatus(value: unknown): string | undefined {
  if (typeof value === "number") {
    return (
      {
        1: "failed",
        2: "pending",
        3: "sent",
        4: "delivered",
        5: "read",
        6: "read",
      } as Record<number, string>
    )[value];
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["error", "failed", "failure"].includes(normalized)) return "failed";
  if (["pending", "queued"].includes(normalized)) return "pending";
  if (["server_ack", "sent", "ack"].includes(normalized)) return "sent";
  if (["delivery_ack", "delivered"].includes(normalized)) return "delivered";
  if (["read", "played"].includes(normalized)) return "read";
  return undefined;
}

/** Reads provider receipt/delete shapes without treating them as new customer messages. */
export function extractProviderMessageUpdate(
  raw: Record<string, unknown>,
): Omit<
  ProviderMessageUpdate,
  "workspaceId" | "channelConnectionId" | "providerMessageId"
> | null {
  const update = asRecord(raw.update);
  const status = providerStatus(
    update.status ?? update.statusCode ?? raw.status,
  );
  const deleted =
    raw.deleted === true ||
    raw.isDeleted === true ||
    ["REVOKE", "MESSAGE_REVOKE", "MESSAGE_REVOKED"].includes(
      String(update.messageStubType ?? "").toUpperCase(),
    );
  if (!status && !deleted) return null;
  return {
    ...(status ? { providerStatus: status } : {}),
    ...(deleted ? { isDeleted: true } : {}),
  };
}

function parseRpcRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("supabase_empty_result");
  return row as T;
}

type AnySupabaseClient = SupabaseClient;

/** Supabase adapter. The RPCs keep multi-table writes atomic and are workspace-scoped in SQL. */
export class SupabaseInboxPort implements InboxPort {
  constructor(private readonly client: AnySupabaseClient) {}

  private async rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(`supabase:${name}:${error.message}`);
    return parseRpcRow<T>(data);
  }

  async ingestMessage(
    input: InboxIngestPortInput,
  ): Promise<InboxIngestPortResult> {
    const row = await this.rpc<Record<string, unknown>>(
      "inbox_ingest_message",
      {
        p_workspace_id: input.workspaceId,
        p_channel_connection_id: input.channelConnectionId,
        p_phone_number: input.phoneNumber,
        p_display_name: input.displayName ?? null,
        p_provider_contact_id: input.providerContactId ?? null,
        p_provider_message_id: input.providerMessageId,
        p_direction: input.direction,
        p_sender_type: input.senderType,
        p_message_type: input.messageType,
        p_text: input.text ?? null,
        p_caption: input.caption ?? null,
        p_media_storage_path: input.mediaStoragePath ?? null,
        p_media_remote_url: input.mediaRemoteUrl ?? null,
        p_mime_type: input.mimeType ?? null,
        p_file_name: input.fileName ?? null,
        p_file_size: input.fileSize ?? null,
        p_duration_seconds: input.durationSeconds ?? null,
        p_quoted_provider_message_id: input.quotedProviderMessageId ?? null,
        p_provider_timestamp: input.providerTimestamp ?? null,
        p_ai_generated: input.aiGenerated ?? false,
        p_sent_by_user_id: input.sentByUserId ?? null,
        p_actor_type: input.actorType,
        p_actor_user_id: input.actorUserId ?? null,
        p_timeline_key: input.timelineKey,
        p_metadata: redactTimelineMetadata(input.metadata),
      },
    );
    return {
      id: String(row.message_id),
      workspaceId: String(input.workspaceId),
      conversationId: String(row.conversation_id),
      contactId: String(row.contact_id),
      providerMessageId: input.providerMessageId,
      unreadCount: Number(row.unread_count ?? 0),
      inserted: row.inserted === true,
    };
  }

  async updateProviderMessage(
    input: ProviderMessageUpdate,
  ): Promise<InboxMessageRecord | null> {
    const result = await this.client
      .from("messages")
      .update({
        ...(input.providerStatus
          ? { provider_status: input.providerStatus }
          : {}),
        ...(input.isDeleted ? { is_deleted: true } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", input.workspaceId)
      .eq("channel_connection_id", input.channelConnectionId)
      .eq("provider_message_id", input.providerMessageId)
      .select("*")
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:messages:update:${result.error.message}`);
    if (!result.data) return null;
    const message = result.data as Record<string, unknown>;
    const conversation = await this.client
      .from("conversations")
      .select("contact_id, unread_count")
      .eq("id", message.conversation_id)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (conversation.error)
      throw new Error(
        `supabase:conversations:update:${conversation.error.message}`,
      );
    return {
      id: String(message.id),
      workspaceId: input.workspaceId,
      conversationId: String(message.conversation_id),
      contactId: String(conversation.data?.contact_id ?? ""),
      providerMessageId: input.providerMessageId,
      direction: message.direction === "outbound" ? "outbound" : "inbound",
      messageType: ([
        "text",
        "image",
        "video",
        "audio",
        "document",
        "reaction",
      ].includes(String(message.message_type))
        ? String(message.message_type)
        : "text") as NormalizedMessageType,
      unreadCount: Number(conversation.data?.unread_count ?? 0),
      inserted: false,
      ...(message.media_storage_path
        ? { mediaStoragePath: String(message.media_storage_path) }
        : {}),
      providerStatus: message.provider_status
        ? String(message.provider_status)
        : null,
      isDeleted: message.is_deleted === true,
    };
  }

  async getConversationContext(
    workspaceId: string,
    conversationId: string,
  ): Promise<InboxConversationContext | null> {
    const conversation = await this.client
      .from("conversations")
      .select("id, workspace_id, channel_connection_id, contact_id, status")
      .eq("id", conversationId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (conversation.error)
      throw new Error(`supabase:conversations:${conversation.error.message}`);
    if (!conversation.data) return null;
    const [contact, channel] = await Promise.all([
      this.client
        .from("contacts")
        .select("id, phone_number, display_name")
        .eq("id", conversation.data.contact_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      this.client
        .from("channel_connections")
        .select("id, provider_instance_name")
        .eq("id", conversation.data.channel_connection_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);
    if (contact.error)
      throw new Error(`supabase:contacts:${contact.error.message}`);
    if (channel.error)
      throw new Error(`supabase:channel_connections:${channel.error.message}`);
    if (!contact.data || !channel.data) return null;
    return {
      id: String(conversation.data.id),
      workspaceId: String(conversation.data.workspace_id),
      channelConnectionId: String(conversation.data.channel_connection_id),
      providerInstanceName: String(channel.data.provider_instance_name),
      remoteJid: `${String(contact.data.phone_number)}@s.whatsapp.net`,
      phoneNumber: String(contact.data.phone_number),
      contactId: String(contact.data.id),
      contactName: String(contact.data.display_name),
      status: String(conversation.data.status),
    };
  }

  async getLatestInbound(
    workspaceId: string,
    conversationId: string,
  ): Promise<LatestInboundRecord | null> {
    const result = await this.client
      .from("messages")
      .select("provider_message_id, provider_timestamp, created_at")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:messages:${result.error.message}`);
    if (!result.data) return null;
    const conversation = await this.getConversationContext(
      workspaceId,
      conversationId,
    );
    if (!conversation) return null;
    return {
      providerMessageId: String(result.data.provider_message_id),
      remoteJid: conversation.remoteJid,
      ...(result.data.provider_timestamp
        ? { providerTimestamp: String(result.data.provider_timestamp) }
        : {}),
    };
  }

  async setConversationState(
    input: Parameters<InboxPort["setConversationState"]>[0],
  ): Promise<ConversationStateRecord> {
    const row = await this.rpc<Record<string, unknown>>(
      "inbox_set_conversation_state",
      {
        p_workspace_id: input.workspaceId,
        p_conversation_id: input.conversationId,
        p_action: input.action,
        p_snoozed_until: input.snoozedUntil ?? null,
        p_actor_user_id: input.actorUserId ?? null,
        p_timeline_key: input.timelineKey,
        p_metadata: redactTimelineMetadata(input.metadata),
      },
    );
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      status: String(row.status),
      attentionState: String(row.attention_state),
      unreadCount: Number(row.unread_count ?? 0),
      lastReadAt: row.last_read_at ? String(row.last_read_at) : null,
      snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
  }

  async attachMessageMedia(
    input: Parameters<InboxPort["attachMessageMedia"]>[0],
  ): Promise<void> {
    const { error } = await this.client
      .from("messages")
      .update({
        media_storage_path: input.storagePath,
        media_remote_url: null,
        mime_type: input.mimeType ?? null,
        file_name: input.fileName ?? null,
        file_size: input.sizeBytes ?? null,
      })
      .eq("id", input.messageId)
      .eq("workspace_id", input.workspaceId);
    if (error) throw new Error(`supabase:messages_media:${error.message}`);
  }

  async linkIssueMessage(
    input: Parameters<InboxPort["linkIssueMessage"]>[0],
  ): Promise<{ inserted: boolean }> {
    const row = await this.rpc<Record<string, unknown>>(
      "inbox_link_issue_message",
      {
        p_workspace_id: input.workspaceId,
        p_issue_id: input.issueId,
        p_message_id: input.messageId,
        p_actor_user_id: input.actorUserId ?? null,
        p_timeline_key: input.timelineKey,
        p_metadata: redactTimelineMetadata(input.metadata),
      },
    );
    return { inserted: row.inserted === true };
  }

  async createEvidence(
    input: Parameters<InboxPort["createEvidence"]>[0],
  ): Promise<EvidenceRecord> {
    const row = await this.rpc<Record<string, unknown>>(
      "inbox_create_evidence",
      {
        p_workspace_id: input.workspaceId,
        p_issue_id: input.issueId,
        p_message_id: input.evidence.messageId ?? null,
        p_kind: input.evidence.kind,
        p_label: input.evidence.label,
        p_body: input.evidence.body ?? null,
        p_storage_path: input.evidence.storagePath ?? null,
        p_mime_type: input.evidence.mimeType ?? null,
        p_size_bytes: input.evidence.sizeBytes ?? null,
        p_actor_user_id: input.actorUserId ?? null,
        p_timeline_key: input.timelineKey,
        p_metadata: redactTimelineMetadata(input.metadata),
      },
    );
    return {
      id: String(row.evidence_id),
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      messageId: row.message_id ? String(row.message_id) : null,
    };
  }

  async getMediaPath(
    input: Parameters<InboxPort["getMediaPath"]>[0],
  ): Promise<string | null> {
    if ((input.messageId ? 1 : 0) + (input.evidenceId ? 1 : 0) !== 1)
      throw new Error("one_media_owner_required");
    const table = input.messageId ? "messages" : "evidence";
    const id = input.messageId ?? input.evidenceId;
    const result = await this.client
      .from(table)
      .select(input.messageId ? "media_storage_path" : "storage_path")
      .eq("id", id)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:${table}_media:${result.error.message}`);
    return result.data
      ? String(
          (result.data as Record<string, unknown>).media_storage_path ??
            (result.data as Record<string, unknown>).storage_path ??
            "",
        ) || null
      : null;
  }

  async createNotification(
    input: Parameters<InboxPort["createNotification"]>[0],
  ): Promise<void> {
    const { error } = await this.client.from("notifications").insert({
      workspace_id: input.workspaceId,
      user_id: input.userId ?? null,
      kind: input.kind.slice(0, 120),
      title: input.title.slice(0, 240),
      body: input.body.slice(0, 2_000),
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      payload_json: {},
      dedupe_key: input.dedupeKey ?? null,
    });
    if (error) throw new Error(`supabase:notifications:${error.message}`);
  }
}

export class InboxService {
  constructor(
    private readonly port: InboxPort,
    private readonly options: {
      mediaStorage?: MediaStorage;
      mediaMaxBytes?: number;
    } = {},
  ) {}

  private context(context: InboxContext): InboxContext {
    return {
      ...context,
      workspaceId: safeWorkspacePart(context.workspaceId, "workspace_id"),
    };
  }

  async persistNormalizedMessage(
    contextInput: InboxContext,
    channelConnectionId: string,
    message: NormalizedWhatsmiauMessage,
    options: PersistMessageOptions = {},
  ): Promise<InboxMessageRecord> {
    const context = this.context(contextInput);
    const connectionId = safeWorkspacePart(
      channelConnectionId,
      "channel_connection_id",
    );
    if (
      options.mediaStoragePath &&
      !options.mediaStoragePath.startsWith(`${context.workspaceId}/`)
    )
      throw new Error("media_storage_scope_violation");
    const providerUpdate = extractProviderMessageUpdate(message.raw);
    if (providerUpdate && this.port.updateProviderMessage) {
      const updated = await this.port.updateProviderMessage({
        workspaceId: context.workspaceId,
        channelConnectionId: connectionId,
        providerMessageId: message.providerMessageId,
        ...providerUpdate,
      });
      if (updated) return updated;
      // Receipt/delete events must never become empty customer messages. A
      // retry lets an out-of-order upsert arrive first.
      throw new Error("message_update_not_found");
    }
    const phoneNumber = normalizePhoneNumber(
      message.phoneNumber || message.remoteJid,
    );
    if (phoneNumber.length < 5) throw new Error("phone_number_required");
    const actorType: InboxActorType =
      message.direction === "inbound"
        ? "contact"
        : (context.actorType ?? "system");
    const result = await this.port.ingestMessage({
      workspaceId: context.workspaceId,
      channelConnectionId: connectionId,
      phoneNumber,
      displayName: message.contactName,
      providerMessageId: message.providerMessageId,
      direction: message.direction,
      senderType: actorType,
      messageType: message.messageType,
      text: message.text,
      caption: message.caption,
      mediaStoragePath: options.mediaStoragePath,
      // Provider media URLs are temporary credentials. Keep only metadata until
      // the server-side fetch has written the object to private storage.
      mediaRemoteUrl: undefined,
      mimeType: message.mimeType,
      fileName: message.fileName,
      fileSize: message.fileSize,
      durationSeconds: message.durationSeconds,
      quotedProviderMessageId: message.quotedProviderMessageId,
      providerTimestamp: message.providerTimestamp,
      aiGenerated: options.aiGenerated ?? actorType === "ai",
      sentByUserId: actorType === "user" ? context.actorUserId : undefined,
      actorType,
      actorUserId: context.actorUserId,
      timelineKey: `whatsapp:${connectionId}:${message.providerMessageId}`,
      metadata: redactTimelineMetadata({
        source: "whatsmiau",
        direction: message.direction,
        message_type: message.messageType,
      }),
    });

    let mediaStoragePath: string | undefined;
    if (
      result.inserted &&
      !options.mediaStoragePath &&
      message.mediaUrl &&
      this.options.mediaStorage
    ) {
      try {
        const media = await fetchRemoteMedia(
          {
            url: message.mediaUrl,
            mimeType: message.mimeType,
            fileName: message.fileName,
          },
          { maxBytes: this.options.mediaMaxBytes },
        );
        mediaStoragePath = buildMediaStoragePath(
          context.workspaceId,
          result.conversationId,
          media,
        );
        await this.options.mediaStorage.upload(mediaStoragePath, media);
        await this.port.attachMessageMedia({
          workspaceId: context.workspaceId,
          messageId: result.id,
          storagePath: mediaStoragePath,
          mimeType: media.mimeType,
          fileName: media.fileName,
          sizeBytes: media.size,
        });
      } catch {
        // The message remains usable without media; never persist a provider
        // exception or a signed URL in a customer-visible timeline.
      }
    }
    return {
      ...result,
      direction: message.direction,
      messageType: message.messageType,
      ...(options.mediaStoragePath
        ? { mediaStoragePath: options.mediaStoragePath }
        : {}),
      ...(mediaStoragePath ? { mediaStoragePath } : {}),
    };
  }

  async recordOutbound(
    contextInput: InboxContext,
    conversationId: string,
    input: {
      providerMessageId: string;
      messageType: NormalizedMessageType;
      text?: string;
      caption?: string;
      mediaStoragePath?: string;
      mediaRemoteUrl?: string;
      mimeType?: string;
      fileName?: string;
      fileSize?: number;
      aiGenerated?: boolean;
    },
  ): Promise<InboxMessageRecord> {
    const context = this.context(contextInput);
    const conversation = await this.port.getConversationContext(
      context.workspaceId,
      safeWorkspacePart(conversationId, "conversation_id"),
    );
    if (!conversation) throw new Error("conversation_not_found");
    return this.persistNormalizedMessage(
      context,
      conversation.channelConnectionId,
      {
        instanceName: conversation.providerInstanceName,
        providerMessageId: input.providerMessageId,
        remoteJid: conversation.remoteJid,
        phoneNumber: conversation.phoneNumber,
        direction: "outbound",
        messageType: input.messageType,
        ...(input.text ? { text: input.text } : {}),
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.mediaRemoteUrl ? { mediaUrl: input.mediaRemoteUrl } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.fileName ? { fileName: input.fileName } : {}),
        ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}),
        raw: {},
      },
      {
        mediaStoragePath: input.mediaStoragePath,
        aiGenerated: input.aiGenerated,
      },
    );
  }

  getConversation(context: InboxContext, conversationId: string) {
    return this.port.getConversationContext(
      this.context(context).workspaceId,
      safeWorkspacePart(conversationId, "conversation_id"),
    );
  }

  latestInbound(context: InboxContext, conversationId: string) {
    return this.port.getLatestInbound(
      this.context(context).workspaceId,
      safeWorkspacePart(conversationId, "conversation_id"),
    );
  }

  async setConversationState(
    contextInput: InboxContext,
    conversationId: string,
    action: ConversationAction,
    snoozedUntil?: Date,
  ): Promise<ConversationStateRecord> {
    const context = this.context(contextInput);
    if (
      action === "snooze" &&
      (!snoozedUntil || snoozedUntil.getTime() <= Date.now())
    )
      throw new Error("snooze_until_must_be_future");
    return this.port.setConversationState({
      workspaceId: context.workspaceId,
      conversationId: safeWorkspacePart(conversationId, "conversation_id"),
      action,
      ...(snoozedUntil ? { snoozedUntil: snoozedUntil.toISOString() } : {}),
      actorUserId: context.actorUserId,
      timelineKey: `conversation:${conversationId}:${action}:${context.actorUserId ?? "system"}`,
      metadata: redactTimelineMetadata({ action }),
    });
  }

  readConversation(context: InboxContext, conversationId: string) {
    return this.setConversationState(context, conversationId, "read");
  }
  markUnread(context: InboxContext, conversationId: string) {
    return this.setConversationState(context, conversationId, "unread");
  }
  snoozeConversation(
    context: InboxContext,
    conversationId: string,
    until: Date,
  ) {
    return this.setConversationState(context, conversationId, "snooze", until);
  }
  resolveConversation(context: InboxContext, conversationId: string) {
    return this.setConversationState(context, conversationId, "resolve");
  }

  async linkIssueMessage(
    contextInput: InboxContext,
    issueId: string,
    messageId: string,
  ): Promise<{ inserted: boolean }> {
    const context = this.context(contextInput);
    return this.port.linkIssueMessage({
      workspaceId: context.workspaceId,
      issueId: safeWorkspacePart(issueId, "issue_id"),
      messageId: safeWorkspacePart(messageId, "message_id"),
      actorUserId: context.actorUserId,
      timelineKey: `issue:${issueId}:message:${messageId}`,
      metadata: redactTimelineMetadata({ source: "inbox" }),
    });
  }

  async addEvidence(
    contextInput: InboxContext,
    issueId: string,
    evidence: EvidenceInput,
  ): Promise<EvidenceRecord> {
    const context = this.context(contextInput);
    const input = { ...evidence, label: evidence.label.trim() };
    if (!input.label) throw new Error("evidence_label_required");
    if (input.kind === "message" && !input.messageId)
      throw new Error("message_evidence_requires_message");
    if (input.kind === "file" && !input.storagePath)
      throw new Error("file_evidence_requires_storage");
    if (input.kind === "link" && !input.body)
      throw new Error("link_evidence_requires_body");
    if (input.storagePath) {
      const segments = input.storagePath.split("/");
      if (
        segments[0] !== context.workspaceId ||
        segments.some(
          (segment) =>
            segment === "." || segment === ".." || segment.length === 0,
        )
      )
        throw new Error("evidence_storage_scope_violation");
    }
    return this.port.createEvidence({
      workspaceId: context.workspaceId,
      issueId: safeWorkspacePart(issueId, "issue_id"),
      actorUserId: context.actorUserId,
      evidence: input,
      timelineKey: `issue:${issueId}:evidence:${randomUUID()}`,
      metadata: redactTimelineMetadata({ source: "inbox", kind: input.kind }),
    });
  }

  async createSignedMediaUrl(
    contextInput: InboxContext,
    input: { messageId?: string; evidenceId?: string },
    expiresInSeconds = 900,
  ): Promise<string> {
    const context = this.context(contextInput);
    if ((input.messageId ? 1 : 0) + (input.evidenceId ? 1 : 0) !== 1)
      throw new Error("one_media_owner_required");
    const path = await this.port.getMediaPath({
      workspaceId: context.workspaceId,
      messageId: input.messageId,
      evidenceId: input.evidenceId,
    });
    if (!path) throw new Error("media_not_found");
    const segments = path.split("/");
    if (
      segments[0] !== context.workspaceId ||
      segments.some(
        (segment) =>
          segment === "." ||
          segment === ".." ||
          segment.length === 0 ||
          segment.includes("\\"),
      )
    )
      throw new Error("media_storage_scope_violation");
    if (!this.options.mediaStorage)
      throw new Error("media_storage_not_configured");
    return this.options.mediaStorage.createSignedUrl(
      path,
      Math.min(Math.max(60, expiresInSeconds), 86_400),
    );
  }

  createNotification(
    contextInput: InboxContext,
    input: {
      userId?: string;
      kind: string;
      title: string;
      body: string;
      entityType?: string;
      entityId?: string;
      dedupeKey?: string;
    },
  ) {
    const context = this.context(contextInput);
    return this.port.createNotification({
      ...input,
      workspaceId: context.workspaceId,
      title: input.title.slice(0, 240),
      body: input.body.slice(0, 2_000),
    });
  }
}

export type InboxMediaInput =
  | Uint8Array
  | string
  | RemoteMediaReference
  | ValidatedMedia;

export function normalizeOutboundMedia(
  input: InboxMediaInput,
  mimeType?: string,
  fileName = "file",
): ValidatedMedia | RemoteMediaReference {
  if (
    typeof input === "object" &&
    input !== null &&
    "data" in input &&
    "mimeType" in input &&
    "size" in input
  )
    return input as ValidatedMedia;
  return parseMediaInput(input, mimeType, fileName);
}
