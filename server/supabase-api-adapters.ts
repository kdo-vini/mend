import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelPort,
  ConversationPort,
  CodingRunPort,
  MembershipAdapter,
  RepositoryPort,
  RequestContext,
  WorkspacePort,
  WorkspaceRole,
} from "./api-router.js";
import {
  createServerSupabaseClient,
  type MendServerSupabaseClient,
} from "./supabase.js";
import {
  InboxService,
  SupabaseInboxPort,
  type ConversationAction,
} from "./inbox-service.js";
import { WhatsAppService, type WhatsAppProvider } from "./whatsapp-service.js";
import { SupabaseMediaStorage, validateRemoteMediaUrl } from "./media.js";
import {
  WhatsmiauMessagingProvider,
  type MessagingInstance,
} from "./whatsmiau.js";
import {
  type IssuePort,
  type IssueRequestContext,
  type IssueCreateInput,
  type IssuePatchInput,
  type IssueListQuery,
  type IssueCommentInput,
  type IssueEvidenceInput,
  type IssueLinkMessageInput,
  type ResolveAndNotifyInput,
} from "./issue-service.js";
import {
  type KnowledgePort,
  type KnowledgeRequestContext,
  type KnowledgeCreateInput,
  type KnowledgePatchInput,
  type KnowledgeListQuery,
} from "./knowledge-service.js";
import {
  createSupportAiProvider,
  type SupportAiProvider,
} from "./providers.js";
import {
  CodexService,
  type RepositoryConfig,
  type RepositoryConfigPort,
} from "./codex-service.js";
import {
  redactSecrets,
  type CodexRunRecord,
  type CodexRunStore,
  type CreateCodexRunInput,
  type SafeTool,
  type UpdateCodexRunInput,
} from "./codex.js";
import type { CodexRunEvent, CodexRunEventInput } from "./codex-events.js";
import type { AllowedCommand } from "../src/core.js";

type AnySupabaseClient = SupabaseClient;
type Row = Record<string, unknown>;
type DbResult = { data: unknown; error: { message?: string } | null };

type WorkspaceCreateInput = {
  name: string;
  slug: string;
  issuePrefix?: string;
  timezone?: string;
  defaultLanguage?: string;
};
type WorkspacePatchInput = Partial<WorkspaceCreateInput>;
type WorkspaceMemberListQuery = {
  role?: string;
  limit: number;
  cursor?: string;
};
type WorkspaceMemberCreateInput = { userId: string; role: string };
type WorkspaceMemberRolePatchInput = { role: string };
type AuditLogListQuery = {
  action?: string;
  entityType?: string;
  limit: number;
  cursor?: string;
};
type ChannelListQuery = { status?: string; limit: number; cursor?: string };
type ChannelCreateInput = {
  name: string;
  providerInstanceName: string;
  phoneNumber?: string;
  profileName?: string;
};
type ConversationListQuery = {
  status?: string;
  attentionState?: string;
  aiMode?: string;
  assignedUserId?: string;
  limit: number;
  cursor?: string;
};
type ConversationPatchInput = {
  status?: string;
  attentionState?: string;
  aiMode?: string;
  assignedUserId?: string | null;
  snoozedUntil?: string | null;
};
type ConversationSnoozeInput = { until: string };
type SendMessageInput = {
  messageType: string;
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mediaDataUrl?: string;
  fileName?: string;
  mimeType?: string;
};
type AiDraftInput = { instruction?: string };
type RepositoryListQuery = { limit: number; cursor?: string };
type RepositoryInput = {
  name: string;
  localPath: string;
  defaultBranch?: string;
  allowedCommands?: string[];
};
type RepositoryPatchInput = Partial<RepositoryInput>;
type CodingRunListQuery = {
  issueId?: string;
  status?: string;
  limit: number;
  cursor?: string;
};
type CodingRunCreateInput = {
  repositoryId?: string;
  mode: "investigate" | "propose_fix" | "implement_fix";
  branchBase?: string;
  instructions?: string;
  allowChanges?: boolean;
  commands?: string[];
};

export interface WhatsmiauProviderPort extends WhatsAppProvider {
  createInstance(input: {
    instanceName: string;
    qrcode?: boolean;
    webhookUrl?: string;
    webhookSecret?: string;
  }): Promise<MessagingInstance>;
  configureWebhook?(input: {
    instanceName: string;
    url: string;
    secret: string;
  }): Promise<unknown>;
  connectInstance(
    instanceName: string,
  ): Promise<{ qrcode?: string; pairingCode?: string }>;
  getQrCode(instanceName: string): Promise<Uint8Array | null>;
  getConnectionState(instanceName: string): Promise<{ state: string }>;
  disconnect(instanceName: string): Promise<unknown>;
}

export interface SupabaseApiAdapterOptions {
  /** Inject an auth-scoped client in request handling; otherwise use the server client factory. */
  client?: AnySupabaseClient | null;
  /** Trusted server client used only for backend-only RPCs such as issue-number allocation. */
  privilegedClient?: AnySupabaseClient | null;
  /** Convenience for request-scoped RLS clients when the caller does not inject one. */
  accessToken?: string;
  whatsMiau?: WhatsmiauProviderPort;
  aiProvider?: SupportAiProvider;
  codexService?: CodexService;
}

export type SupabaseApiPortDependencies = {
  membership: MembershipAdapter;
  workspaces: WorkspacePort;
  channels: ChannelPort;
  conversations: ConversationPort;
  issues: IssuePort;
  knowledge: KnowledgePort;
  repositories: RepositoryPort;
  codingRuns: CodingRunPort;
};

function requireClient(
  value: AnySupabaseClient | null | undefined,
): AnySupabaseClient {
  if (!value) throw new Error("supabase_server_not_configured");
  return value;
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row) : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullable(value: unknown): string | null {
  return value == null ? null : String(value);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rpcRow(value: unknown): Row {
  const result = row(Array.isArray(value) ? value[0] : value);
  if (!Object.keys(result).length) throw new Error("supabase_empty_result");
  return result;
}

function checked(scope: string, result: DbResult): unknown {
  if (result.error)
    throw new Error(
      `supabase:${scope}:${result.error.message ?? "unknown_error"}`,
    );
  return result.data;
}

function workspace(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    name: str(rowValue.name),
    slug: str(rowValue.slug),
    issuePrefix: str(rowValue.issue_prefix, "MEND"),
    timezone: str(rowValue.timezone, "UTC"),
    defaultLanguage: str(rowValue.default_language, "en"),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

function workspaceMember(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    userId: str(rowValue.user_id),
    role: str(rowValue.role, "viewer"),
    createdAt: nullable(rowValue.created_at),
  };
}

function auditLog(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: nullable(rowValue.workspace_id),
    actorUserId: nullable(rowValue.actor_user_id),
    action: str(rowValue.action),
    entityType: str(rowValue.entity_type),
    entityId: nullable(rowValue.entity_id),
    metadata: row(rowValue.metadata_json),
    createdAt: nullable(rowValue.created_at),
  };
}

function channel(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    provider: str(rowValue.provider, "whatsmiau"),
    name: str(rowValue.name),
    providerInstanceName: str(rowValue.provider_instance_name),
    phoneNumber: nullable(rowValue.phone_number),
    profileName: nullable(rowValue.profile_name),
    status: str(rowValue.status, "closed"),
    connectedAt: nullable(rowValue.connected_at),
    lastEventAt: nullable(rowValue.last_event_at),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

function message(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    conversationId: str(rowValue.conversation_id),
    channelConnectionId: str(rowValue.channel_connection_id),
    providerMessageId: str(rowValue.provider_message_id),
    direction: str(rowValue.direction),
    senderType: str(rowValue.sender_type),
    messageType: str(rowValue.message_type, "text"),
    text: nullable(rowValue.text),
    caption: nullable(rowValue.caption),
    mediaStoragePath: nullable(rowValue.media_storage_path),
    mimeType: nullable(rowValue.mime_type),
    fileName: nullable(rowValue.file_name),
    providerStatus: nullable(rowValue.provider_status),
    aiGenerated: rowValue.ai_generated === true,
    sentByUserId: nullable(rowValue.sent_by_user_id),
    providerTimestamp: nullable(rowValue.provider_timestamp),
    createdAt: nullable(rowValue.created_at),
  };
}

function conversation(rowValue: Row): Row {
  const contact = row(rowValue.contact);
  const linkedChannel = row(rowValue.channel);
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    channelConnectionId: str(rowValue.channel_connection_id),
    contactId: str(rowValue.contact_id),
    status: str(rowValue.status, "open"),
    attentionState: str(rowValue.attention_state, "needs_attention"),
    assignedUserId: nullable(rowValue.assigned_user_id),
    aiMode: str(rowValue.ai_mode, "draft"),
    unreadCount: num(rowValue.unread_count),
    lastReadAt: nullable(rowValue.last_read_at),
    lastMessageAt: nullable(rowValue.last_message_at),
    lastInboundAt: nullable(rowValue.last_inbound_at),
    lastOutboundAt: nullable(rowValue.last_outbound_at),
    resolvedAt: nullable(rowValue.resolved_at),
    snoozedUntil: nullable(rowValue.snoozed_until),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
    ...(Object.keys(contact).length
      ? {
          contact: {
            id: str(contact.id),
            phoneNumber: str(contact.phone_number),
            displayName: str(contact.display_name),
          },
        }
      : {}),
    ...(Object.keys(linkedChannel).length
      ? { channel: channel(linkedChannel) }
      : {}),
    ...(Array.isArray(rowValue.messages)
      ? { messages: rows(rowValue.messages).map(message) }
      : {}),
  };
}

function issue(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    number: num(rowValue.number),
    identifier: str(rowValue.identifier),
    conversationId: nullable(rowValue.conversation_id),
    contactId: nullable(rowValue.contact_id),
    source: str(rowValue.source, "internal"),
    type: str(rowValue.type, "task"),
    priority: str(rowValue.priority, "none"),
    status: str(rowValue.status, "triage"),
    title: str(rowValue.title),
    description: nullable(rowValue.description),
    aiSummary: nullable(rowValue.ai_summary),
    impact: nullable(rowValue.impact),
    reproductionSteps: Array.isArray(rowValue.reproduction_steps_json)
      ? rowValue.reproduction_steps_json
      : [],
    expectedBehavior: nullable(rowValue.expected_behavior),
    actualBehavior: nullable(rowValue.actual_behavior),
    affectedProduct: nullable(rowValue.affected_product),
    affectedEnvironment: nullable(rowValue.affected_environment),
    confidence: rowValue.confidence == null ? null : num(rowValue.confidence),
    createdByUserId: nullable(rowValue.created_by_user_id),
    assignedUserId: nullable(rowValue.assigned_user_id),
    parentIssueId: nullable(rowValue.parent_issue_id),
    duplicateOfIssueId: nullable(rowValue.duplicate_of_issue_id),
    resolvedAt: nullable(rowValue.resolved_at),
    customerNotifiedAt: nullable(rowValue.customer_notified_at),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
    ...(Array.isArray(rowValue.labels) ? { labels: rowValue.labels } : {}),
    ...(Array.isArray(rowValue.comments)
      ? { comments: rowValue.comments }
      : {}),
    ...(Array.isArray(rowValue.evidence)
      ? { evidence: rowValue.evidence }
      : {}),
    ...(Array.isArray(rowValue.timeline)
      ? { timeline: rowValue.timeline }
      : {}),
  };
}

function article(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    title: str(rowValue.title),
    category: str(rowValue.category, "Support"),
    body: str(rowValue.body),
    status: str(rowValue.status, "draft"),
    createdByUserId: nullable(rowValue.created_by_user_id),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

function repository(
  rowValue: Row,
): RepositoryConfig & { allowedCommands: string[] } {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    name: str(rowValue.name),
    localPath: str(rowValue.local_path),
    defaultBranch: str(rowValue.default_branch, "main"),
    allowedCommands: Array.isArray(rowValue.allowed_commands)
      ? rowValue.allowed_commands.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  };
}

function run(rowValue: Row): CodexRunRecord {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    issueId: str(rowValue.issue_id),
    ...(rowValue.repository_id
      ? { repositoryId: String(rowValue.repository_id) }
      : {}),
    mode: str(rowValue.mode, "investigate") as CodexRunRecord["mode"],
    status: str(rowValue.status, "queued") as CodexRunRecord["status"],
    progress: num(rowValue.progress),
    ...(rowValue.branch_name
      ? { branchName: String(rowValue.branch_name) }
      : {}),
    ...(rowValue.commit_sha ? { commitSha: String(rowValue.commit_sha) } : {}),
    result: row(rowValue.result_json),
    ...(rowValue.started_at ? { startedAt: String(rowValue.started_at) } : {}),
    ...(rowValue.finished_at
      ? { finishedAt: String(rowValue.finished_at) }
      : {}),
    ...(rowValue.created_by_user_id
      ? { createdByUserId: String(rowValue.created_by_user_id) }
      : {}),
    createdAt: str(rowValue.created_at),
    updatedAt: str(rowValue.updated_at),
  };
}

function providerStatus(
  value: unknown,
): "open" | "closed" | "connecting" | "qr-code" {
  const state = String(value ?? "").toLowerCase();
  if (state === "open" || state === "connected") return "open";
  if (state === "qr" || state === "qrcode" || state === "qr-code")
    return "qr-code";
  if (state === "connecting" || state === "pending") return "connecting";
  return "closed";
}

function issueDbPayload(value: IssueCreateInput | IssuePatchInput): Row {
  const input = value as unknown as Row;
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.aiSummary !== undefined ? { ai_summary: input.aiSummary } : {}),
    ...(input.impact !== undefined ? { impact: input.impact } : {}),
    ...(input.reproductionSteps !== undefined
      ? { reproduction_steps_json: input.reproductionSteps }
      : {}),
    ...(input.expectedBehavior !== undefined
      ? { expected_behavior: input.expectedBehavior }
      : {}),
    ...(input.actualBehavior !== undefined
      ? { actual_behavior: input.actualBehavior }
      : {}),
    ...(input.affectedProduct !== undefined
      ? { affected_product: input.affectedProduct }
      : {}),
    ...(input.affectedEnvironment !== undefined
      ? { affected_environment: input.affectedEnvironment }
      : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.conversationId !== undefined
      ? { conversation_id: input.conversationId }
      : {}),
    ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
    ...(input.assignedUserId !== undefined
      ? { assigned_user_id: input.assignedUserId }
      : {}),
    ...(input.parentIssueId !== undefined
      ? { parent_issue_id: input.parentIssueId }
      : {}),
    ...(input.duplicateOfIssueId !== undefined
      ? { duplicate_of_issue_id: input.duplicateOfIssueId }
      : {}),
  };
}

function repositoryDbPayload(
  value: RepositoryInput | RepositoryPatchInput,
): Row {
  const input = value as unknown as Row;
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.localPath !== undefined ? { local_path: input.localPath } : {}),
    ...(input.defaultBranch !== undefined
      ? { default_branch: input.defaultBranch }
      : {}),
    ...(input.allowedCommands !== undefined
      ? { allowed_commands: input.allowedCommands }
      : {}),
  };
}

export class SupabaseMembershipAdapter implements MembershipAdapter {
  constructor(private readonly client: AnySupabaseClient) {}

  async getMembership(userId: string, workspaceId: string) {
    const result = await this.client
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    const data = checked("workspace_members.get", result);
    if (!data) return null;
    const value = row(data);
    const role = str(value.role) as WorkspaceRole;
    return ["owner", "admin", "agent", "viewer"].includes(role)
      ? { workspaceId: str(value.workspace_id), role }
      : null;
  }
}

export class SupabaseWorkspaceAdapter implements WorkspacePort {
  constructor(private readonly client: AnySupabaseClient) {}

  async list(userId: string) {
    const result = await this.client
      .from("workspace_members")
      .select("workspace_id, role, workspaces(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const data = rows(checked("workspaces.list", result));
    return data.map((item) => ({
      ...workspace(row(item.workspaces)),
      role: str(item.role),
    }));
  }

  async create(userId: string, input: WorkspaceCreateInput) {
    const result = await this.client.rpc("create_workspace", {
      p_name: input.name,
      p_slug: input.slug,
      p_issue_prefix: input.issuePrefix ?? "MEND",
      p_timezone: input.timezone ?? "America/Sao_Paulo",
      p_default_language: input.defaultLanguage ?? "en",
    });
    return {
      ...workspace(rpcRow(checked("create_workspace", result))),
      createdByUserId: userId,
      role: "owner" as const,
    };
  }

  async get(context: RequestContext, workspaceId: string) {
    if (context.workspaceId !== workspaceId) return null;
    const result = await this.client
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("workspaces.get", result);
    return data ? workspace(row(data)) : null;
  }

  async update(
    context: RequestContext,
    workspaceId: string,
    input: WorkspacePatchInput,
  ) {
    if (context.workspaceId !== workspaceId) return null;
    const value = input as unknown as Row;
    const result = await this.client
      .from("workspaces")
      .update({
        ...(value.name !== undefined ? { name: value.name } : {}),
        ...(value.slug !== undefined ? { slug: value.slug } : {}),
        ...(value.issuePrefix !== undefined
          ? { issue_prefix: value.issuePrefix }
          : {}),
        ...(value.timezone !== undefined ? { timezone: value.timezone } : {}),
        ...(value.defaultLanguage !== undefined
          ? { default_language: value.defaultLanguage }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("workspaces.update", result);
    return data ? workspace(row(data)) : null;
  }

  async listMembers(context: RequestContext, query: WorkspaceMemberListQuery) {
    let request = this.client
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.role) request = request.eq("role", query.role);
    if (query.cursor) request = request.lt("created_at", query.cursor);
    const result = await request
      .order("created_at", { ascending: true })
      .limit(query.limit);
    return rows(checked("workspace_members.list", result)).map(workspaceMember);
  }

  async addMember(context: RequestContext, input: WorkspaceMemberCreateInput) {
    const result = await this.client.rpc("add_workspace_member", {
      p_workspace_id: context.workspaceId,
      p_user_id: input.userId,
      p_role: input.role,
    });
    return workspaceMember(rpcRow(checked("workspace_members.add", result)));
  }

  async updateMemberRole(
    context: RequestContext,
    userId: string,
    input: WorkspaceMemberRolePatchInput,
  ) {
    const result = await this.client.rpc("update_workspace_member_role", {
      p_workspace_id: context.workspaceId,
      p_user_id: userId,
      p_role: input.role,
    });
    return workspaceMember(
      rpcRow(checked("workspace_members.update_role", result)),
    );
  }

  async removeMember(context: RequestContext, userId: string) {
    const result = await this.client.rpc("remove_workspace_member", {
      p_workspace_id: context.workspaceId,
      p_user_id: userId,
    });
    return checked("workspace_members.remove", result) === true;
  }

  async listAuditLog(context: RequestContext, query: AuditLogListQuery) {
    let request = this.client
      .from("audit_log")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.action) request = request.eq("action", query.action);
    if (query.entityType) request = request.eq("entity_type", query.entityType);
    if (query.cursor) request = request.lt("created_at", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("audit_log.list", result)).map(auditLog);
  }
}

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

export class SupabaseConversationAdapter implements ConversationPort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;

  constructor(
    private readonly client: AnySupabaseClient,
    provider: WhatsAppProvider,
    private readonly ai: SupportAiProvider,
    mediaStorage?: SupabaseMediaStorage,
  ) {
    this.inbox = new InboxService(
      new SupabaseInboxPort(client),
      mediaStorage ? { mediaStorage } : {},
    );
    this.whatsapp = new WhatsAppService(this.inbox, provider, mediaStorage);
  }

  async list(context: RequestContext, query: ConversationListQuery) {
    let request = this.client
      .from("conversations")
      .select(
        "*, contact:contacts(id, phone_number, display_name), channel:channel_connections(*)",
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
        "*, contact:contacts(id, phone_number, display_name), channel:channel_connections(*)",
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

  async sendMessage(
    context: RequestContext,
    conversationId: string,
    input: SendMessageInput,
  ) {
    const actor = {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorType: "user" as const,
    };
    if (input.messageType === "text")
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
    const values = rows((current as Row).messages)
      .map(
        (item) => `${str(item.direction)}: ${str(item.text || item.caption)}`,
      )
      .join("\n");
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
    const draft = await this.ai.draftReply(
      `${values}${input.instruction ? `\nOperator instruction: ${input.instruction}` : ""}`,
      knowledge,
    );
    return {
      conversationId,
      draft,
      provider: this.ai.name,
      knowledgeArticleIds: rows(articles.data).map((item) => str(item.id)),
    };
  }
}

export class SupabaseIssueAdapter implements IssuePort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;

  constructor(
    private readonly client: AnySupabaseClient,
    provider: WhatsAppProvider,
    mediaStorage?: SupabaseMediaStorage,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {
    this.inbox = new InboxService(
      new SupabaseInboxPort(client),
      mediaStorage ? { mediaStorage } : {},
    );
    this.whatsapp = new WhatsAppService(this.inbox, provider, mediaStorage);
  }

  private async getRow(context: IssueRequestContext, identifier: string) {
    const result = await this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const data = checked("issues.get", result);
    return data ? row(data) : null;
  }

  private async details(context: IssueRequestContext, issueRow: Row) {
    const issueId = str(issueRow.id);
    const [labels, comments, evidence, timeline] = await Promise.all([
      this.client
        .from("issue_labels")
        .select("label:labels(id, name, color)")
        .eq("issue_id", issueId),
      this.client
        .from("issue_comments")
        .select("*")
        .eq("issue_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
      this.client
        .from("evidence")
        .select("*")
        .eq("issue_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
      this.client
        .from("timeline_events")
        .select("*")
        .eq("entity_type", "issue")
        .eq("entity_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
    ]);
    const data = [labels, comments, evidence, timeline] as DbResult[];
    ["issue_labels", "issue_comments", "evidence", "timeline_events"].forEach(
      (scope, index) => checked(scope, data[index]),
    );
    return {
      ...issueRow,
      labels: rows(labels.data).map((item) => row(item.label)),
      comments: rows(comments.data),
      evidence: rows(evidence.data),
      timeline: rows(timeline.data),
    };
  }

  async list(context: IssueRequestContext, query: IssueListQuery) {
    const value = query as unknown as Row;
    let request = this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (value.status) request = request.eq("status", value.status);
    if (value.priority) request = request.eq("priority", value.priority);
    if (value.assignedUserId)
      request = request.eq("assigned_user_id", value.assignedUserId);
    if (value.search) request = request.ilike("title", `%${value.search}%`);
    if (value.type) request = request.eq("type", value.type);
    if (value.source) request = request.eq("source", value.source);
    if (value.contactId) request = request.eq("contact_id", value.contactId);
    if (value.conversationId)
      request = request.eq("conversation_id", value.conversationId);

    // Labels and Codex runs are normalized relations, not denormalized issue
    // columns. Resolve their scoped issue ids before applying the main query.
    let relationIssueIds: string[] | undefined;
    if (value.label) {
      const labelResult = await this.client
        .from("labels")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("name", value.label)
        .maybeSingle();
      const labelRow = checked("labels.filter", labelResult);
      if (!labelRow) return [];
      const issueLabels = await this.client
        .from("issue_labels")
        .select("issue_id")
        .eq("label_id", str(row(labelRow).id));
      relationIssueIds = rows(checked("issue_labels.filter", issueLabels))
        .map((item) => str(item.issue_id))
        .filter(Boolean);
    }
    if (value.hasCodex !== undefined) {
      const runs = await this.client
        .from("coding_runs")
        .select("issue_id")
        .eq("workspace_id", context.workspaceId);
      const runIds = new Set(
        rows(checked("coding_runs.filter", runs))
          .map((item) => str(item.issue_id))
          .filter(Boolean),
      );
      if (value.hasCodex === true)
        relationIssueIds = relationIssueIds
          ? relationIssueIds.filter((id) => runIds.has(id))
          : [...runIds];
      else {
        const allIssues = await this.client
          .from("issues")
          .select("id")
          .eq("workspace_id", context.workspaceId);
        const allIds = rows(checked("issues.filter_all", allIssues))
          .map((item) => str(item.id))
          .filter(Boolean);
        const withoutCodex = allIds.filter((id) => !runIds.has(id));
        relationIssueIds = relationIssueIds
          ? relationIssueIds.filter((id) => withoutCodex.includes(id))
          : withoutCodex;
      }
    }
    if (relationIssueIds !== undefined) {
      if (!relationIssueIds.length) return [];
      request = request.in("id", relationIssueIds);
    }
    if (value.cursor) request = request.gt("id", value.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(Number(value.limit ?? 50));
    return rows(checked("issues.list", result)).map(issue);
  }

  async create(context: IssueRequestContext, input: IssueCreateInput) {
    const claimed = await this.privilegedClient.rpc("claim_issue_number", {
      target_workspace_id: context.workspaceId,
    });
    const identifierValue = checked("claim_issue_number", claimed);
    const identifier =
      typeof identifierValue === "string"
        ? identifierValue
        : str(rpcRow(identifierValue).identifier);
    const number = Number(identifier.split("-").at(-1));
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error("supabase_invalid_issue_identifier");
    const result = await this.client
      .from("issues")
      .insert({
        ...issueDbPayload(input),
        workspace_id: context.workspaceId,
        number,
        identifier,
        created_by: "user",
        created_by_user_id: context.userId,
      })
      .select("*")
      .single();
    const created = row(checked("issues.create", result));
    await this.syncLabels(
      context,
      str(created.id),
      (input as unknown as Row).labels as string[] | undefined,
    );
    return issue(await this.details(context, created));
  }

  async get(context: IssueRequestContext, identifier: string) {
    const value = await this.getRow(context, identifier);
    return value ? issue(await this.details(context, value)) : null;
  }

  async update(
    context: IssueRequestContext,
    identifier: string,
    input: IssuePatchInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    const result = await this.client
      .from("issues")
      .update({
        ...issueDbPayload(input),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const updated = checked("issues.update", result);
    if (!updated) return null;
    const labels = (input as unknown as Row).labels;
    if (labels !== undefined)
      await this.syncLabels(context, str(current.id), labels as string[]);
    return issue(await this.details(context, row(updated)));
  }

  async remove(context: IssueRequestContext, identifier: string) {
    const current = await this.getRow(context, identifier);
    if (!current) return false;
    const result = await this.client
      .from("issues")
      .delete()
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("issues.delete", result)).length > 0;
  }

  private async syncLabels(
    context: IssueRequestContext,
    issueId: string,
    names?: string[],
  ) {
    if (names === undefined) return;
    const normalized = [
      ...new Set(names.map((value) => value.trim()).filter(Boolean)),
    ];
    const existing = await this.client
      .from("labels")
      .select("id, name")
      .eq("workspace_id", context.workspaceId);
    const existingRows = rows(checked("labels.list", existing));
    const ids: string[] = [];
    for (const name of normalized) {
      const found = existingRows.find((value) => str(value.name) === name);
      if (found) ids.push(str(found.id));
      else {
        const created = await this.client
          .from("labels")
          .insert({ workspace_id: context.workspaceId, name })
          .select("id")
          .single();
        ids.push(str(row(checked("labels.create", created)).id));
      }
    }
    checked(
      "issue_labels.clear",
      await this.client.from("issue_labels").delete().eq("issue_id", issueId),
    );
    if (ids.length)
      checked(
        "issue_labels.create",
        await this.client
          .from("issue_labels")
          .insert(
            ids.map((labelId) => ({ issue_id: issueId, label_id: labelId })),
          ),
      );
  }

  async addComment(
    context: IssueRequestContext,
    identifier: string,
    input: IssueCommentInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    const result = await this.client
      .from("issue_comments")
      .insert({
        workspace_id: context.workspaceId,
        issue_id: current.id,
        author_user_id: context.userId,
        author_type: "user",
        body: input.body,
      })
      .select("*")
      .single();
    return row(checked("issue_comments.create", result));
  }

  async addEvidence(
    context: IssueRequestContext,
    identifier: string,
    input: IssueEvidenceInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    return {
      ...(await this.inbox.addEvidence(
        {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorType: "user",
        },
        str(current.id),
        {
          kind: input.kind,
          label: input.label,
          body: input.body,
          messageId: input.messageId,
          storagePath: input.storagePath,
          mimeType: input.mimeType,
          sizeBytes: input.size,
        },
      )),
      identifier,
    };
  }

  async linkMessage(
    context: IssueRequestContext,
    identifier: string,
    input: IssueLinkMessageInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    return {
      ...(await this.inbox.linkIssueMessage(
        { workspaceId: context.workspaceId, actorUserId: context.userId },
        str(current.id),
        input.messageId,
      )),
      identifier,
    };
  }

  async resolveAndNotify(
    context: IssueRequestContext,
    identifier: string,
    input: ResolveAndNotifyInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    let notifiedAt: string | undefined;
    if (input.notifyCustomer && input.message && current.conversation_id) {
      await this.whatsapp.sendText(
        {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorType: "user",
        },
        str(current.conversation_id),
        { text: input.message },
      );
      notifiedAt = new Date().toISOString();
    }
    const result = await this.client
      .from("issues")
      .update({
        status: "done",
        resolved_at: new Date().toISOString(),
        ...(notifiedAt ? { customer_notified_at: notifiedAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    checked("issues.resolve", result);
    checked(
      "timeline_events.issue_resolved",
      await this.client.from("timeline_events").insert({
        workspace_id: context.workspaceId,
        entity_type: "issue",
        entity_id: current.id,
        event_type: "issue.resolved",
        actor_type: "user",
        actor_user_id: context.userId,
        metadata_json: { customerNotified: Boolean(notifiedAt) },
        dedupe_key: `issue:${current.id}:resolved:${context.userId}`,
      }),
    );
    return result.data
      ? issue(await this.details(context, row(result.data)))
      : null;
  }
}

export class SupabaseKnowledgeAdapter implements KnowledgePort {
  constructor(private readonly client: AnySupabaseClient) {}

  async list(context: KnowledgeRequestContext, query: KnowledgeListQuery) {
    const value = query as unknown as Row;
    let request = this.client
      .from("knowledge_articles")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (value.status) request = request.eq("status", value.status);
    if (value.category) request = request.eq("category", value.category);
    if (value.search) request = request.ilike("title", `%${value.search}%`);
    if (value.cursor) request = request.gt("id", value.cursor);
    const result = await request
      .order("updated_at", { ascending: false })
      .limit(Number(value.limit ?? 100));
    return rows(checked("knowledge_articles.list", result)).map(article);
  }

  async create(context: KnowledgeRequestContext, input: KnowledgeCreateInput) {
    const result = await this.client
      .from("knowledge_articles")
      .insert({
        workspace_id: context.workspaceId,
        title: input.title,
        category: input.category,
        body: input.body,
        status: input.status,
        created_by_user_id: context.userId,
      })
      .select("*")
      .single();
    return article(row(checked("knowledge_articles.create", result)));
  }

  async update(
    context: KnowledgeRequestContext,
    id: string,
    input: KnowledgePatchInput,
  ) {
    const value = input as unknown as Row;
    const result = await this.client
      .from("knowledge_articles")
      .update({
        ...(value.title !== undefined ? { title: value.title } : {}),
        ...(value.category !== undefined ? { category: value.category } : {}),
        ...(value.body !== undefined ? { body: value.body } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("knowledge_articles.update", result);
    return data ? article(row(data)) : null;
  }

  async remove(context: KnowledgeRequestContext, id: string) {
    const result = await this.client
      .from("knowledge_articles")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("knowledge_articles.delete", result)).length > 0;
  }
}

export class SupabaseRepositoryAdapter
  implements RepositoryPort, RepositoryConfigPort
{
  constructor(private readonly client: AnySupabaseClient) {}

  async list(context: RequestContext, query: RepositoryListQuery) {
    let request = this.client
      .from("repositories")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("repositories.list", result)).map(repository);
  }
  async create(context: RequestContext, input: RepositoryInput) {
    const result = await this.client
      .from("repositories")
      .insert({
        workspace_id: context.workspaceId,
        ...repositoryDbPayload(input),
      })
      .select("*")
      .single();
    return repository(row(checked("repositories.create", result)));
  }
  async update(
    context: RequestContext,
    id: string,
    input: RepositoryPatchInput,
  ) {
    const result = await this.client
      .from("repositories")
      .update({
        ...repositoryDbPayload(input),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("repositories.update", result);
    return data ? repository(row(data)) : null;
  }
  async remove(context: RequestContext, id: string) {
    const result = await this.client
      .from("repositories")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("repositories.delete", result)).length > 0;
  }

  async getRepository(workspaceId: string, repositoryId: string) {
    const result = await this.client
      .from("repositories")
      .select("*")
      .eq("id", repositoryId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("repositories.get", result);
    return data ? repository(row(data)) : null;
  }
}

export class SupabaseCodexRunStore implements CodexRunStore {
  constructor(private readonly client: AnySupabaseClient) {}

  async createRun(input: CreateCodexRunInput) {
    const result = await this.client
      .from("coding_runs")
      .insert({
        workspace_id: input.workspaceId,
        issue_id: input.issueId,
        repository_id: input.repositoryId ?? null,
        mode: input.mode,
        status: "queued",
        progress: 0,
        branch_name: input.branchName ?? null,
        result_json: {},
        created_by_user_id: input.createdByUserId ?? null,
      })
      .select("*")
      .single();
    return run(row(checked("coding_runs.create", result)));
  }
  async getRun(id: string) {
    const result = await this.client
      .from("coding_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const data = checked("coding_runs.get", result);
    return data ? run(row(data)) : null;
  }
  async getRunScoped(id: string, workspaceId: string) {
    const result = await this.client
      .from("coding_runs")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("coding_runs.get_scoped", result);
    return data ? run(row(data)) : null;
  }
  async updateRun(id: string, input: UpdateCodexRunInput) {
    const result = await this.client
      .from("coding_runs")
      .update({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.progress !== undefined ? { progress: input.progress } : {}),
        ...(input.branchName !== undefined
          ? { branch_name: input.branchName }
          : {}),
        ...(input.commitSha !== undefined
          ? { commit_sha: input.commitSha }
          : {}),
        ...(input.result !== undefined ? { result_json: input.result } : {}),
        ...(input.startedAt !== undefined
          ? { started_at: input.startedAt }
          : {}),
        ...(input.finishedAt !== undefined
          ? { finished_at: input.finishedAt }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = checked("coding_runs.update", result);
    return data ? run(row(data)) : undefined;
  }
  async appendEvent(
    runId: string,
    input: CodexRunEventInput,
  ): Promise<CodexRunEvent> {
    const current = await this.getRun(runId);
    if (!current) throw new Error("coding_run_not_found");
    const result = await this.client
      .from("coding_run_events")
      .insert({
        workspace_id: current.workspaceId,
        coding_run_id: runId,
        event_type: input.eventType,
        message: redactSecrets(input.message).slice(0, 2_000),
        metadata_json: input.metadata ?? {},
      })
      .select("*")
      .single();
    const value = row(checked("coding_run_events.create", result));
    return {
      id: str(value.id),
      runId,
      eventType: str(value.event_type) as CodexRunEvent["eventType"],
      message: str(value.message),
      metadata: row(value.metadata_json),
      createdAt: str(value.created_at),
    };
  }
}

export class SupabaseCodingRunAdapter implements CodingRunPort {
  private readonly codex: CodexService;

  constructor(
    private readonly client: AnySupabaseClient,
    private readonly repositories: RepositoryConfigPort,
    private readonly store: SupabaseCodexRunStore,
    codexService?: CodexService,
  ) {
    this.codex =
      codexService ?? new CodexService({ repositories, runs: store });
  }

  async list(context: RequestContext, query: CodingRunListQuery) {
    let request = this.client
      .from("coding_runs")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.issueId) request = request.eq("issue_id", query.issueId);
    if (query.status) request = request.eq("status", query.status);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("coding_runs.list", result)).map(run);
  }

  async create(
    context: RequestContext,
    identifier: string,
    input: CodingRunCreateInput,
  ) {
    const issueResult = await this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const issueValue = checked("coding_runs.issue", issueResult);
    if (!issueValue) throw new Error("issue_not_found");
    const issue = row(issueValue);
    if (!input.repositoryId) throw new Error("repository_required");
    if (
      !(await this.repositories.getRepository(
        context.workspaceId,
        input.repositoryId,
      ))
    )
      throw new Error("repository_not_found");

    const codexContext = await this.loadCodexContext(
      context,
      issue,
      identifier,
      input.instructions,
    );
    const tools: SafeTool[] = (input.commands ?? []).map((name) => ({
      kind: "command",
      name: name as AllowedCommand,
    }));
    const handle = await this.codex.start({
      workspaceId: context.workspaceId,
      issueId: str(issue.id),
      repositoryId: input.repositoryId,
      issueIdentifier: identifier,
      issueTitle: str(issue.title),
      mode: input.mode,
      context: codexContext,
      tools,
      createdByUserId: context.userId,
    });

    // The request is useful operator metadata. Persist it after start so the
    // runner remains the only component that creates the queued run and emits
    // its lifecycle events.
    const current = (await this.store.getRun(handle.runId)) ?? handle.run;
    const request = {
      issueIdentifier: identifier,
      branchBase: input.branchBase ?? "main",
      commands: input.commands ?? [],
      allowChanges: input.allowChanges ?? false,
      ...(input.instructions
        ? { instructions: redactSecrets(input.instructions).slice(0, 20_000) }
        : {}),
    };
    const persisted = await this.store.updateRun(handle.runId, {
      result: { ...current.result, request },
    });

    // HTTP creation must not wait for a potentially long sandbox run. Attach a
    // rejection handler because the service persists the failure asynchronously.
    void handle.completion.catch(() => undefined);
    return persisted ?? current;
  }

  private async loadCodexContext(
    context: RequestContext,
    issue: Row,
    identifier: string,
    instructions?: string,
  ) {
    const issueId = str(issue.id);
    const commentsPromise = this.client
      .from("issue_comments")
      .select("author_type, body, created_at")
      .eq("issue_id", issueId)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: true })
      .limit(100);
    const conversationId = str(issue.conversation_id);
    const messagesPromise = conversationId
      ? this.client
          .from("messages")
          .select("direction, sender_type, text, caption, created_at")
          .eq("conversation_id", conversationId)
          .eq("workspace_id", context.workspaceId)
          .order("created_at", { ascending: true })
          .limit(200)
      : Promise.resolve(null);
    const [comments, messages] = await Promise.all([
      commentsPromise,
      messagesPromise,
    ]);
    const commentRows = rows(checked("coding_runs.issue_comments", comments));
    const messageRows = messages
      ? rows(checked("coding_runs.messages", messages))
      : [];
    const contextMessages = [
      ...messageRows.map((value) => ({
        direction: str(value.direction),
        senderType: str(value.sender_type),
        text: str(value.text || value.caption),
        createdAt: str(value.created_at),
      })),
      ...commentRows.map((value) => ({
        direction: "comment",
        senderType: str(value.author_type),
        text: str(value.body),
        createdAt: str(value.created_at),
      })),
    ];
    const description = [
      str(issue.description),
      str(issue.impact) ? `Impact: ${str(issue.impact)}` : "",
      Array.isArray(issue.reproduction_steps_json) &&
      issue.reproduction_steps_json.length
        ? `Reproduction steps:\n${issue.reproduction_steps_json.map((step) => String(step)).join("\n")}`
        : "",
      str(issue.expected_behavior)
        ? `Expected behavior: ${str(issue.expected_behavior)}`
        : "",
      str(issue.actual_behavior)
        ? `Actual behavior: ${str(issue.actual_behavior)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      issue: {
        id: issueId,
        identifier,
        title: str(issue.title),
        ...(str(issue.ai_summary) ? { summary: str(issue.ai_summary) } : {}),
        ...(description ? { description } : {}),
        ...(str(issue.priority) ? { priority: str(issue.priority) } : {}),
        ...(str(issue.status) ? { status: str(issue.status) } : {}),
      },
      ...(contextMessages.length || str(issue.ai_summary)
        ? {
            conversation: {
              ...(str(issue.ai_summary)
                ? { summary: str(issue.ai_summary) }
                : {}),
              messages: contextMessages,
            },
          }
        : {}),
      ...(instructions
        ? { goal: redactSecrets(instructions).slice(0, 20_000) }
        : {}),
    };
  }
  async get(context: RequestContext, id: string) {
    return this.store.getRunScoped(id, context.workspaceId);
  }
  private async scoped(context: RequestContext, id: string) {
    return this.store.getRunScoped(id, context.workspaceId);
  }
  async cancel(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.cancel(id);
  }
  async approve(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.approve(id);
  }
  async reject(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.reject(id);
  }
  async patch(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    const diff = await this.codex.getDiff(id);
    return { patch: diff.patch, truncated: diff.truncated };
  }
}

export function createSupabaseApiAdapters(
  options: SupabaseApiAdapterOptions = {},
): SupabaseApiPortDependencies {
  const client = requireClient(
    options.client ?? createServerSupabaseClient(options.accessToken),
  );
  const privilegedClient = options.privilegedClient ?? client;
  const provider =
    options.whatsMiau ??
    (new WhatsmiauMessagingProvider() as WhatsmiauProviderPort);
  const ai = options.aiProvider ?? createSupportAiProvider();
  const membership = new SupabaseMembershipAdapter(client);
  const workspaces = new SupabaseWorkspaceAdapter(client);
  const channels = new SupabaseChannelAdapter(client, provider);
  const mediaStorage = new SupabaseMediaStorage(client);
  const conversations = new SupabaseConversationAdapter(
    client,
    provider,
    ai,
    mediaStorage,
  );
  const issues = new SupabaseIssueAdapter(
    client,
    provider,
    mediaStorage,
    privilegedClient,
  );
  const knowledge = new SupabaseKnowledgeAdapter(client);
  const repositories = new SupabaseRepositoryAdapter(client);
  const store = new SupabaseCodexRunStore(client);
  const codingRuns = new SupabaseCodingRunAdapter(
    client,
    repositories,
    store,
    options.codexService,
  );
  return {
    membership,
    workspaces,
    channels,
    conversations,
    issues,
    knowledge,
    repositories,
    codingRuns,
  };
}

/** Compatibility wrapper for the server bootstrap; authentication stays outside this factory. */
export class SupabaseApiAdapters {
  private readonly ports: SupabaseApiPortDependencies;

  constructor(options: SupabaseApiAdapterOptions = {}) {
    this.ports = createSupabaseApiAdapters(options);
  }

  dependencies(): SupabaseApiPortDependencies {
    return this.ports;
  }
}

export type { MendServerSupabaseClient };
