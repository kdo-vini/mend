import { conversationReplyInput } from "../../automation/decision.js";
import {
  type AgentCredentialPort,
  type AiDraftInput,
  type ChannelCreateInput,
  type ChannelListQuery,
  type ChannelPort,
  type ConversationListQuery,
  type ConversationPatchInput,
  type ConversationPort,
  type ConversationSnoozeInput,
  type ConversationStartInput,
  type RequestContext,
  type SendMessageInput,
} from "../../contracts/api-ports.js";
import {
  InboxService,
  SupabaseInboxPort,
  type ConversationAction,
} from "../../inbox-service.js";
import { normalizeLocale } from "../../locale.js";
import { SupabaseMediaPipeline } from "../../media-pipeline.js";
import { SupabaseMediaStorage, validateRemoteMediaUrl } from "../../media.js";
import {
  resolveSupportAiProvider,
  SupportAiConfigurationError,
  type SupportAiProvider,
} from "../../providers.js";
import type { AnySupabaseClient, WhatsmiauProviderPort } from "./types.js";
import {
  WhatsAppService,
  type WhatsAppProvider,
} from "../../whatsapp-service.js";
import {
  channel,
  checked,
  conversation,
  providerStatus,
  row,
  rows,
  str,
  type Row,
} from "../supabase-mappers.js";
export class SupabaseChannelAdapter implements ChannelPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly provider: WhatsmiauProviderPort,
  ) {}

  private webhookUrl(): string | undefined {
    const explicitUrl = process.env.WHATSMIAU_WEBHOOK_URL?.trim();
    if (explicitUrl) {
      try {
        // Reuse the same public-HTTPS/SSRF guard used by media URLs. A local
        // HTTPS URL is still not reachable by Whatsmiau and must not be sent.
        return validateRemoteMediaUrl(explicitUrl).toString();
      } catch {
        return undefined;
      }
    }

    const baseUrl = process.env.APP_BASE_URL?.trim();
    if (!baseUrl) return undefined;
    try {
      const url = new URL("/webhooks/whatsmiau", baseUrl);
      // Whatsmiau cannot call a localhost webhook. Local development can still
      // create/pair an instance; set WHATSMIAU_WEBHOOK_URL to an HTTPS tunnel
      // (or the public app URL) when inbound events should be delivered.
      return validateRemoteMediaUrl(url.toString()).toString();
    } catch {
      return undefined;
    }
  }

  private webhookConfiguration(): { url: string; secret: string } | undefined {
    const secret = process.env.WHATSMIAU_WEBHOOK_SECRET?.trim();
    const url = this.webhookUrl();
    return secret && url ? { url, secret } : undefined;
  }

  /**
   * Repairs channels created before webhook configuration existed. The
   * provider endpoint is idempotent, so connect/refresh and repeated setup
   * can safely call this without creating a second channel or persisting a
   * secret in Supabase.
   */
  private async ensureWebhook(value: Row): Promise<void> {
    const configuration = this.webhookConfiguration();
    if (!configuration || !this.provider.configureWebhook) return;
    const instanceName = str(value.provider_instance_name);
    if (!instanceName) return;
    await this.provider.configureWebhook({ instanceName, ...configuration });
  }

  async list(context: RequestContext, query: ChannelListQuery) {
    let request = this.client
      .from("channel_connections")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.status) request = request.eq("status", query.status);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("channel_connections.list", result)).map(channel);
  }

  async createWhatsmiau(context: RequestContext, input: ChannelCreateInput) {
    const existingResult = await this.client
      .from("channel_connections")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("provider_instance_name", input.providerInstanceName)
      .maybeSingle();
    const existing = checked("channel_connections.existing", existingResult);
    if (existing) {
      const existingRow = row(existing);
      await this.ensureWebhook(existingRow);
      return channel(existingRow);
    }

    const webhook = this.webhookConfiguration();
    let providerCreated = false;
    try {
      const instance = await this.provider.createInstance({
        instanceName: input.providerInstanceName,
        qrcode: true,
        syncFullHistory: true,
        ...(webhook
          ? { webhookUrl: webhook.url, webhookSecret: webhook.secret }
          : {}),
      });
      providerCreated = true;
      const result = await this.client
        .from("channel_connections")
        .insert({
          workspace_id: context.workspaceId,
          provider: "whatsmiau",
          name: input.name,
          provider_instance_name: input.providerInstanceName,
          phone_number: input.phoneNumber ?? instance.phoneNumber ?? null,
          profile_name: input.profileName ?? null,
          status: providerStatus(instance.state),
          connected_at:
            providerStatus(instance.state) === "open"
              ? new Date().toISOString()
              : null,
        })
        .select("*")
        .single();
      return channel(row(checked("channel_connections.create", result)));
    } catch (error) {
      if (providerCreated)
        await this.provider
          .disconnect(input.providerInstanceName)
          .catch(() => undefined);
      throw error;
    }
  }

  private async getRow(context: RequestContext, channelId: string) {
    const result = await this.client
      .from("channel_connections")
      .select("*")
      .eq("id", channelId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const data = checked("channel_connections.get", result);
    return data ? row(data) : null;
  }

  async get(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    return value ? channel(value) : null;
  }

  async getSettings(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    if (!value) return null;
    return { channelId, settings: row(value.settings_json) };
  }

  async updateSettings(
    context: RequestContext,
    channelId: string,
    settings: Record<string, unknown>,
  ) {
    const current = await this.getRow(context, channelId);
    if (!current) return null;
    const currentSettings = row(current.settings_json);
    const result = await this.client
      .from("channel_connections")
      .update({
        settings_json: { ...currentSettings, ...settings },
        updated_at: new Date().toISOString(),
      })
      .eq("id", channelId)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("channel_connections.settings", result);
    return data ? channel(row(data)) : null;
  }

  async connect(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    if (!value) return null;
    await this.ensureWebhook(value);
    const result = await this.provider.connectInstance(
      str(value.provider_instance_name),
    );
    return this.updateState(
      context,
      channelId,
      result.qrcode || result.pairingCode ? "qr-code" : "connecting",
    );
  }

  async qr(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    if (!value) return null;
    const qr = await this.provider.getQrCode(str(value.provider_instance_name));
    if (!qr) return null;
    return {
      data: `data:image/png;base64,${Buffer.from(qr).toString("base64")}`,
      mimeType: "image/png",
    };
  }

  async disconnect(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    if (!value) return null;
    await this.provider.disconnect(str(value.provider_instance_name));
    return this.updateState(context, channelId, "closed");
  }

  async refresh(context: RequestContext, channelId: string) {
    const value = await this.getRow(context, channelId);
    if (!value) return null;
    await this.ensureWebhook(value);
    const result = await this.provider.getConnectionState(
      str(value.provider_instance_name),
    );
    return this.updateState(context, channelId, providerStatus(result.state));
  }

  private async updateState(
    context: RequestContext,
    channelId: string,
    status: "open" | "closed" | "connecting" | "qr-code",
  ) {
    const result = await this.client
      .from("channel_connections")
      .update({
        status,
        ...(status === "open"
          ? { connected_at: new Date().toISOString() }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channelId)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("channel_connections.state", result);
    return data ? channel(row(data)) : null;
  }
}

/**
 * WhatsApp stores a Brazilian mobile with or without the ninth digit depending
 * on how the JID arrived, so `5511988887777` and `551188887777` are the same
 * person. A phone lookup that missed the stored form would send a cold first
 * message into a live thread, so both forms are probed. Scoped to +55 on
 * purpose: no other dial plan in use here has this duplication.
 */
function brazilianPhoneVariants(phoneNumber: string): string[] {
  const match = /^55(\d{2})(\d{8,9})$/.exec(phoneNumber);
  if (!match) return [phoneNumber];
  const [, areaCode, subscriber] = match;
  if (subscriber.length === 9 && subscriber.startsWith("9"))
    return [phoneNumber, `55${areaCode}${subscriber.slice(1)}`];
  if (subscriber.length === 8)
    return [phoneNumber, `55${areaCode}9${subscriber}`];
  return [phoneNumber];
}

export class SupabaseConversationAdapter implements ConversationPort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;

  constructor(
    private readonly client: AnySupabaseClient,
    provider: WhatsAppProvider,
    private readonly ai: SupportAiProvider | undefined,
    mediaStorage?: SupabaseMediaStorage,
    private readonly mediaPipeline?: SupabaseMediaPipeline,
    private readonly agentCredentials?: AgentCredentialPort,
    private readonly metricsClient?: AnySupabaseClient,
  ) {
    this.inbox = new InboxService(
      new SupabaseInboxPort(client),
      mediaStorage ? { mediaStorage } : {},
    );
    this.whatsapp = new WhatsAppService(this.inbox, provider, mediaStorage);
  }

  private async recordConversationFact(
    context: RequestContext,
    conversationId: string,
    factType: "founder_intervention" | "policy_required_touch",
    suffix: string,
  ): Promise<void> {
    if (!this.metricsClient) return;
    const result = await this.metricsClient.from("workflow_facts").upsert(
      {
        workspace_id: context.workspaceId,
        workflow_id: conversationId,
        fact_type: factType,
        value_boolean: true,
        idempotency_key: `${conversationId}:${factType}:${suffix}`,
      },
      { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true },
    );
    checked(`workflow_facts.${factType}`, result);
  }

  async list(context: RequestContext, query: ConversationListQuery) {
    let request = this.client
      .from("conversations")
      .select(
        "*, contact:contacts(id, phone_number, display_name), channel:channel_connections(*), ai_state:conversation_ai_state(*)",
      )
      .eq("workspace_id", context.workspaceId);
    if (query.status) request = request.eq("status", query.status);
    if (query.attentionState)
      request = request.eq("attention_state", query.attentionState);
    if (query.aiMode) request = request.eq("ai_mode", query.aiMode);
    if (query.assignedUserId)
      request = request.eq("assigned_user_id", query.assignedUserId);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("last_message_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("conversations.list", result)).map(conversation);
  }

  async get(context: RequestContext, conversationId: string) {
    const result = await this.client
      .from("conversations")
      .select(
        "*, contact:contacts(id, phone_number, display_name), channel:channel_connections(*), ai_state:conversation_ai_state(*)",
      )
      .eq("id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const data = checked("conversations.get", result);
    if (!data) return null;
    const messages = await this.client
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: true })
      .limit(200);
    return conversation({
      ...row(data),
      messages: rows(checked("messages.list", messages)),
    });
  }

  async findByPhone(context: RequestContext, phoneNumber: string) {
    // The typed form is probed first, so an exact contact always wins.
    for (const candidate of brazilianPhoneVariants(phoneNumber)) {
      const contactResult = await this.client
        .from("contacts")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("phone_number", candidate)
        .maybeSingle();
      const contact = checked("contacts.by_phone", contactResult);
      if (!contact) continue;
      const result = await this.client
        .from("conversations")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("contact_id", str(row(contact).id))
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const data = checked("conversations.by_phone", result);
      if (data) return { id: str(row(data).id) };
    }
    return null;
  }

  async start(context: RequestContext, input: ConversationStartInput) {
    const result = await this.client
      .from("channel_connections")
      .select("id, provider_instance_name, status")
      .eq("id", input.channelId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const data = checked("channel_connections.start_conversation", result);
    if (!data) return null;
    const connection = row(data);
    if (str(connection.status) !== "open")
      throw new Error("channel_not_connected");
    const message = await this.whatsapp.startConversation(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      {
        channelConnectionId: str(connection.id),
        instanceName: str(connection.provider_instance_name),
        phoneNumber: input.phoneNumber,
        text: input.message,
      },
    );
    return { conversationId: message.conversationId };
  }

  async delete(context: RequestContext, conversationId: string) {
    const result = await this.client
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .select("id")
      .maybeSingle();
    return Boolean(checked("conversations.delete", result));
  }

  async deleteMessage(
    context: RequestContext,
    conversationId: string,
    messageId: string,
  ) {
    const result = await this.client
      .from("messages")
      .select("id, provider_message_id, direction, is_deleted")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const message = checked("messages.get_for_delete", result) as Record<
      string,
      unknown
    > | null;
    if (!message) return null;
    if (message.direction !== "outbound") return null;
    if (message.is_deleted === true) return this.get(context, conversationId);
    await this.whatsapp.deleteMessageForEveryone(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      conversationId,
      {
        id: String(message.provider_message_id),
        fromMe: message.direction === "outbound",
      },
    );
    const updated = await this.client
      .from("messages")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .select("id")
      .maybeSingle();
    checked("messages.mark_deleted", updated);
    return this.get(context, conversationId);
  }

  async reactToMessage(
    context: RequestContext,
    conversationId: string,
    messageId: string,
    reaction: string,
  ) {
    const result = await this.client
      .from("messages")
      .select("id, provider_message_id, direction, is_deleted, message_type")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const message = checked("messages.get_for_reaction", result) as Record<
      string,
      unknown
    > | null;
    if (
      !message ||
      message.is_deleted === true ||
      message.message_type === "reaction"
    )
      return message ? this.get(context, conversationId) : null;
    const sentReaction = await this.whatsapp.sendReaction(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      conversationId,
      {
        providerMessageId: String(message.provider_message_id),
        fromMe: message.direction === "outbound",
        reaction,
      },
    );
    const previousReactionsQuery = this.client
      .from("messages")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("conversation_id", conversationId)
      .eq("quoted_message_id", messageId)
      .eq("message_type", "reaction")
      .eq("direction", "outbound");
    if (sentReaction) previousReactionsQuery.neq("id", sentReaction.id);
    const previousReactions = await previousReactionsQuery;
    if (previousReactions.error)
      throw new Error(
        `supabase:messages:reaction_cleanup:${previousReactions.error.message}`,
      );
    return this.get(context, conversationId);
  }

  async sendPresence(
    context: RequestContext,
    conversationId: string,
    presence: "composing" | "recording" | "paused",
  ) {
    await this.whatsapp.sendPresence(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      conversationId,
      presence,
    );
  }

  async update(
    context: RequestContext,
    conversationId: string,
    input: ConversationPatchInput,
  ) {
    const value = input as unknown as Row;
    const result = await this.client
      .from("conversations")
      .update({
        ...(value.status !== undefined ? { status: value.status } : {}),
        ...(value.attentionState !== undefined
          ? { attention_state: value.attentionState }
          : {}),
        ...(value.aiMode !== undefined ? { ai_mode: value.aiMode } : {}),
        ...(value.assignedUserId !== undefined
          ? { assigned_user_id: value.assignedUserId }
          : {}),
        ...(value.snoozedUntil !== undefined
          ? { snoozed_until: value.snoozedUntil }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("conversations.update", result);
    return data ? conversation(row(data)) : null;
  }

  private async state(
    context: RequestContext,
    conversationId: string,
    action: ConversationAction,
    snoozedUntil?: string,
  ) {
    const result = await this.inbox.setConversationState(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      conversationId,
      action,
      snoozedUntil ? new Date(snoozedUntil) : undefined,
    );
    return (await this.get(context, conversationId)) ?? result;
  }

  async markRead(context: RequestContext, conversationId: string) {
    await this.whatsapp.markRead(
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorType: "user",
      },
      conversationId,
    );
    return this.get(context, conversationId);
  }

  snooze(
    context: RequestContext,
    conversationId: string,
    input: ConversationSnoozeInput,
  ) {
    return this.state(context, conversationId, "snooze", input.until);
  }
  resolve(context: RequestContext, conversationId: string) {
    return this.state(context, conversationId, "resolve");
  }

  async pauseAi(
    context: RequestContext,
    conversationId: string,
    reason: string,
  ) {
    const result = await this.client.rpc("pause_conversation_ai", {
      p_workspace_id: context.workspaceId,
      p_conversation_id: conversationId,
      p_reason: reason,
    });
    checked("conversation_ai.pause", result);
    if (context.role === "owner")
      await this.recordConversationFact(
        context,
        conversationId,
        "founder_intervention",
        reason,
      );
    return this.get(context, conversationId);
  }

  async resumeAi(context: RequestContext, conversationId: string) {
    const result = await this.client.rpc("resume_conversation_ai", {
      p_workspace_id: context.workspaceId,
      p_conversation_id: conversationId,
    });
    checked("conversation_ai.resume", result);
    return this.get(context, conversationId);
  }

  async sendMessage(
    context: RequestContext,
    conversationId: string,
    input: SendMessageInput,
  ) {
    if (context.role === "owner")
      await this.recordConversationFact(
        context,
        conversationId,
        "founder_intervention",
        "human-message",
      );
    const actor = {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorType: "user" as const,
    };
    if (input.attachments?.length) {
      if (!this.mediaPipeline) throw new Error("media_pipeline_not_configured");
      if (input.attachments.length > 10)
        throw new Error("media_batch_limit_exceeded");
      for (const attachment of input.attachments) {
        const asset = await this.mediaPipeline.findAsset(
          context,
          attachment.assetId,
        );
        if (!asset || asset.conversationId !== conversationId)
          throw new Error("media_asset_not_found");
        if (input.mediaBatchId && asset.batchId !== input.mediaBatchId)
          throw new Error("media_batch_mismatch");
        if (asset.status !== "ready")
          throw new Error(`media_asset_${asset.status}`);
        const requestKey = attachment.idempotencyKey;
        const existingRequest = await this.client
          .from("media_send_requests")
          .select("id, status, attempts")
          .eq("workspace_id", context.workspaceId)
          .eq("idempotency_key", requestKey)
          .maybeSingle();
        if (existingRequest.error)
          throw new Error(
            `media_send_request:${existingRequest.error.message}`,
          );
        if (existingRequest.data?.status === "sent") continue;
        const request = await this.client.from("media_send_requests").upsert(
          {
            workspace_id: context.workspaceId,
            conversation_id: conversationId,
            batch_id: input.mediaBatchId ?? asset.batchId ?? null,
            asset_id: attachment.assetId,
            idempotency_key: requestKey,
            status: "sending",
            attempts: Number(existingRequest.data?.attempts ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,idempotency_key" },
        );
        if (request.error)
          throw new Error(`media_send_request:${request.error.message}`);
        const providerUrl = await this.mediaPipeline.signedUrl(
          context,
          attachment.assetId,
          "provider",
        );
        try {
          const sent = await this.whatsapp.sendMedia(actor, conversationId, {
            media: providerUrl.url,
            mimeType: asset.detectedMimeType ?? asset.declaredMimeType,
            fileName: asset.originalFileName,
            caption: attachment.caption,
            mediaType: attachment.messageType,
            mediaStoragePathOverride: asset.originalStoragePath,
          });
          await this.client
            .from("messages")
            .update({
              media_asset_id: attachment.assetId,
              media_batch_id: input.mediaBatchId ?? asset.batchId ?? null,
              media_status: "ready",
            })
            .eq("id", sent.message.id)
            .eq("workspace_id", context.workspaceId);
          await this.client
            .from("media_send_requests")
            .update({
              status: "sent",
              provider_message_id: sent.providerMessageId,
              message_id: sent.message.id,
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", context.workspaceId)
            .eq("idempotency_key", requestKey);
        } catch (error) {
          await this.client
            .from("media_send_requests")
            .update({
              status: "failed",
              error_code:
                error instanceof Error
                  ? error.message.slice(0, 160)
                  : "media_send_failed",
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", context.workspaceId)
            .eq("idempotency_key", requestKey);
          throw error;
        }
      }
    } else if (input.messageType === "text")
      await this.whatsapp.sendText(actor, conversationId, {
        text: input.text ?? "",
      });
    else
      await this.whatsapp.sendMedia(actor, conversationId, {
        media: input.mediaDataUrl ?? input.mediaUrl ?? "",
        mimeType: input.mimeType,
        fileName: input.fileName,
        caption: input.caption,
        mediaType: input.messageType as
          | "image"
          | "video"
          | "audio"
          | "document",
      });
    return this.get(context, conversationId);
  }

  async aiDraft(
    context: RequestContext,
    conversationId: string,
    input: AiDraftInput,
  ) {
    const current = await this.get(context, conversationId);
    if (!current) return null;
    const values = conversationReplyInput(
      rows((current as Row).messages).map((item) => ({
        id: str(item.id),
        direction: str(item.direction),
        text: str(item.text),
        caption: str(item.caption),
      })),
    );
    const articles = await this.client
      .from("knowledge_articles")
      .select("id, title, body")
      .eq("workspace_id", context.workspaceId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(50);
    const knowledge = rows(checked("knowledge_articles.published", articles))
      .map((item) => `${str(item.title)}\n${str(item.body)}`)
      .join("\n\n");
    const workspace = await this.client
      .from("workspaces")
      .select("default_language")
      .eq("id", context.workspaceId)
      .single();
    const workspaceRow = checked("workspace.language", workspace) as {
      default_language?: unknown;
    };
    const operationalLanguage = normalizeLocale(workspaceRow.default_language);
    const provider = this.agentCredentials
      ? await resolveSupportAiProvider(
          context.workspaceId,
          this.agentCredentials,
        )
      : this.ai;
    if (!provider)
      throw new SupportAiConfigurationError(
        "support_ai_configuration_required",
      );
    const draft = await provider.draftReply(
      `${values}${input.instruction ? `\nOperator instruction: ${input.instruction}` : ""}`,
      knowledge,
      operationalLanguage,
    );
    return {
      conversationId,
      draft,
      provider: provider.name,
      knowledgeArticleIds: rows(articles.data).map((item) => str(item.id)),
    };
  }
}
