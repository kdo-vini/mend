import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  type ChannelPort,
  type ChannelCreateInput,
  type ChannelListQuery,
  type ConversationPort,
  type ConversationListQuery,
  type ConversationPatchInput,
  type ConversationSnoozeInput,
  type SendMessageInput,
  type AiDraftInput,
  type CodingRunPort,
  type GitHubConnectionPort,
  type CodingRunCreateInput,
  type CodingRunListQuery,
  type MembershipAdapter,
  type RepositoryPort,
  type RepositoryInput,
  type RepositoryListQuery,
  type RepositoryPatchInput,
  type RequestContext,
  type WorkspaceCreateInput,
  type WorkspacePatchInput,
  type WorkspaceMemberCreateInput,
  type WorkspaceMemberListQuery,
  type WorkspaceMemberRolePatchInput,
  type WorkspaceInvitationCreateInput,
  type WorkspaceInvitationRolePatchInput,
  type AuditLogListQuery,
  type WorkspacePort,
  type WorkspaceRole,
  type MediaPort,
  type AgentCredentialPort,
  type AgentCredentialTask,
  type AgentProvider,
  type AgentCredentialRecord,
} from "./contracts/api-ports.js";
import {
  type KanbanIssuePort,
  type KanbanMoveInput,
  type PersonalEventCreateInput,
  type PersonalEventListQuery,
  type PersonalEventPatchInput,
  type PersonalPlanningPort,
  type PersonalTaskCreateInput,
  type PersonalTaskListQuery,
  type PersonalTaskPatchInput,
} from "./kanban-service.js";
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
import { SupabaseMediaPipeline } from "./media-pipeline.js";
import type { JobStore } from "./jobs.js";
import type { WhatsmiauMessageJobPayload } from "./worker.js";
import {
  AGENT_RUN_REQUESTED_JOB_TYPE,
  type AgentRunRequestedJobPayload,
} from "./agent-runtime.js";
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
import { normalizeLocale } from "./locale.js";
import { conversationReplyInput } from "./automation/decision.js";
import {
  CodexService,
  CodexServiceError,
  type RepositoryConfigPort,
} from "./codex-service.js";
import { createDokployDeploymentFromEnv } from "./deployment.js";
import {
  redactSecrets,
  type CodexRunStore,
  type CreateCodexRunInput,
  type SafeTool,
  type UpdateCodexRunInput,
} from "./codex.js";
import type { CodexRunEvent, CodexRunEventInput } from "./codex-events.js";
import type { AllowedCommand } from "../src/core.js";
import { normalizeWorkspaceAiPolicy } from "../src/ai-policy.js";
import { SupabaseBugLoopStore, type BugLoopStage } from "./bug-loop.js";
import {
  createGitHubControlPlaneFromEnv,
  createGitHubSetupState,
  githubInstallationUrl,
  hashGitHubSetupState,
  validateGitHubSetupCallback,
  GitHubControlPlaneError,
} from "./github-control-plane.js";
import {
  createGoogleOAuthState,
  decryptGoogleToken,
  encryptGoogleToken,
  googleAuthorizationUrl,
  googleCalendarScopes,
  GoogleConnectionError,
  hashGoogleOAuthState,
  requireGoogleOAuthConfig,
  verifyGoogleOAuthState,
  type GoogleCalendarSummary,
  type GoogleConnectionPort,
  type GoogleConnectionRecord,
} from "./google-calendar.js";
import {
  connectionEncryptionKey,
  decryptMcpSecret,
  discoverMcpTools,
  encryptMcpSecret,
  McpConnectionError,
  mcpConnectionRecordFromRow,
  sanitizeMcpError,
  validateMcpHeaders,
  validateMcpServerUrl,
  type McpAiMode,
  type McpAuthMode,
  type McpConnectionInput,
  type McpConnectionPatch,
  type McpConnectionPort,
  type McpConnectionRecord,
} from "./mcp.js";
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "./connection-crypto.js";
import {
  article,
  auditLog,
  channel,
  checked,
  conversation,
  issue,
  issueDbPayload,
  providerStatus,
  repository,
  repositoryDbPayload,
  rpcRow,
  row,
  rows,
  run,
  str,
  workspace,
  workspaceMember,
  workspaceMemberWithEmail,
  workspaceInvitation,
  type DbResult,
  type Row,
} from "./adapters/supabase-mappers.js";

type AnySupabaseClient = SupabaseClient;

export interface WhatsmiauProviderPort extends WhatsAppProvider {
  createInstance(input: {
    instanceName: string;
    qrcode?: boolean;
    syncFullHistory?: boolean;
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
  /** Service-role client reserved for Auth invitation delivery and member e-mail lookups. */
  invitationClient?: AnySupabaseClient | null;
  /** Convenience for request-scoped RLS clients when the caller does not inject one. */
  accessToken?: string;
  whatsMiau?: WhatsmiauProviderPort;
  aiProvider?: SupportAiProvider;
  codexService?: CodexService;
  jobStore?: JobStore<WhatsmiauMessageJobPayload>;
}

export type SupabaseApiPortDependencies = {
  membership: MembershipAdapter;
  workspaces: WorkspacePort;
  channels: ChannelPort;
  conversations: ConversationPort;
  issues: IssuePort;
  knowledge: KnowledgePort;
  repositories: RepositoryPort;
  agentCredentials: AgentCredentialPort;
  githubConnections: GitHubConnectionPort;
  codingRuns: CodingRunPort;
  googleConnections: GoogleConnectionPort;
  mcpConnections: McpConnectionPort;
  media: MediaPort;
  kanban: KanbanIssuePort;
  personalPlanning: PersonalPlanningPort;
};

function requireClient(
  value: AnySupabaseClient | null | undefined,
): AnySupabaseClient {
  if (!value) throw new Error("supabase_server_not_configured");
  return value;
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
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient | null,
  ) {}

  private requirePrivilegedClient(): AnySupabaseClient {
    if (!this.privilegedClient)
      throw new Error("supabase_invitation_admin_unavailable");
    return this.privilegedClient;
  }

  private invitationRedirect(invitationId: string): string {
    const configuredBase =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!configuredBase && process.env.NODE_ENV === "production")
      throw new Error("invitation_base_url_missing");
    const base = (configuredBase || "http://localhost:5173").replace(/\/$/, "");
    return `${base}/accept-invite?invitation=${encodeURIComponent(invitationId)}`;
  }

  private async workspaceName(workspaceId: string): Promise<string> {
    const result = await this.requirePrivilegedClient()
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("workspace_invitations.workspace_name", result);
    return str(row(data).name, "TechneOS");
  }

  private async recordInvitationDelivery(
    invitationId: string,
    status: "sent" | "failed",
    kind: "invite" | "recovery" | null,
    errorCode?: string,
  ): Promise<Row> {
    const result = await this.requirePrivilegedClient().rpc(
      "record_workspace_invitation_delivery",
      {
        p_invitation_id: invitationId,
        p_status: status,
        p_kind: kind,
        p_error_code: errorCode ?? null,
      },
    );
    return rpcRow(checked("workspace_invitations.delivery", result));
  }

  private async sendInvitationEmail(
    invitation: Row,
    workspaceName: string,
  ): Promise<Row> {
    const admin = this.requirePrivilegedClient();
    const email = str(invitation.email);
    const invitationId = str(invitation.id);
    const redirectTo = this.invitationRedirect(invitationId);
    let kind: "invite" | "recovery" = "invite";
    try {
      const invite = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { workspace_name: workspaceName },
      });
      if (!invite.error) {
        return this.recordInvitationDelivery(invitationId, "sent", kind);
      }
      const code = String(
        (invite.error as { code?: string }).code ?? "",
      ).toLowerCase();
      if (code !== "email_exists" && code !== "user_already_exists")
        throw invite.error;

      kind = "recovery";
      const recovery = await admin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (recovery.error) throw recovery.error;
      return this.recordInvitationDelivery(invitationId, "sent", kind);
    } catch (error) {
      const code = String(
        (error as { code?: string }).code ?? "auth_invitation_failed",
      )
        .toLowerCase()
        .slice(0, 120);
      try {
        await this.recordInvitationDelivery(invitationId, "failed", kind, code);
      } catch {
        // Preserve the delivery error for the caller even if the status update
        // is unavailable. The invitation remains visible for a retry.
      }
      throw new Error("invitation_delivery_failed");
    }
  }

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
      p_default_language: normalizeLocale(input.defaultLanguage),
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
          ? { default_language: normalizeLocale(value.defaultLanguage) }
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
    const result = await this.client.rpc("list_workspace_members_with_email", {
      p_workspace_id: context.workspaceId,
    });
    const members = rows(checked("workspace_members.list", result));
    return members
      .filter((member) => !query.role || str(member.role) === query.role)
      .filter(
        (member) => !query.cursor || str(member.created_at) < query.cursor,
      )
      .slice(0, query.limit)
      .map(workspaceMemberWithEmail);
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

  async listInvitations(context: RequestContext) {
    const result = await this.requirePrivilegedClient()
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return rows(checked("workspace_invitations.list", result)).map(
      workspaceInvitation,
    );
  }

  async createInvitation(
    context: RequestContext,
    input: WorkspaceInvitationCreateInput,
  ) {
    this.requirePrivilegedClient();
    const created = await this.client.rpc("create_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_email: input.email.trim().toLowerCase(),
      p_role: input.role,
    });
    const invitation = rpcRow(checked("workspace_invitations.create", created));
    const sent = await this.sendInvitationEmail(
      invitation,
      await this.workspaceName(context.workspaceId),
    );
    return workspaceInvitation(sent);
  }

  async updateInvitationRole(
    context: RequestContext,
    invitationId: string,
    input: WorkspaceInvitationRolePatchInput,
  ) {
    const result = await this.client.rpc("update_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_invitation_id: invitationId,
      p_role: input.role,
    });
    return workspaceInvitation(
      rpcRow(checked("workspace_invitations.update_role", result)),
    );
  }

  async removeInvitation(context: RequestContext, invitationId: string) {
    const result = await this.client.rpc("revoke_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_invitation_id: invitationId,
    });
    return checked("workspace_invitations.revoke", result) === true;
  }

  async resendInvitation(context: RequestContext, invitationId: string) {
    const result = await this.requirePrivilegedClient()
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    const invitation = row(checked("workspace_invitations.get", result));
    if (!Object.keys(invitation).length)
      throw new Error("workspace_invitation_not_found");
    const sent = await this.sendInvitationEmail(
      invitation,
      await this.workspaceName(context.workspaceId),
    );
    return workspaceInvitation(sent);
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

export class SupabaseConversationAdapter implements ConversationPort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;

  constructor(
    private readonly client: AnySupabaseClient,
    provider: WhatsAppProvider,
    private readonly ai: SupportAiProvider,
    mediaStorage?: SupabaseMediaStorage,
    private readonly mediaPipeline?: SupabaseMediaPipeline,
    private readonly agentCredentials?: AgentCredentialPort,
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
      ? createSupportAiProvider({
          apiKey: (
            await this.agentCredentials.resolve(
              context.workspaceId,
              "support",
              "openai",
            )
          )?.apiKey,
        })
      : this.ai;
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

export class SupabaseIssueAdapter implements IssuePort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;
  private readonly bugLoop: SupabaseBugLoopStore;

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
    this.bugLoop = new SupabaseBugLoopStore(privilegedClient as never);
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

    // Labels and Agent runs are normalized relations, not denormalized issue
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
    if (value.hasAgent !== undefined) {
      const runs = await this.client
        .from("agent_runs")
        .select("issue_id")
        .eq("workspace_id", context.workspaceId);
      const runIds = new Set(
        rows(checked("agent_runs.filter", runs))
          .map((item) => str(item.issue_id))
          .filter(Boolean),
      );
      if (value.hasAgent === true)
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
        const withoutAgent = allIds.filter((id) => !runIds.has(id));
        relationIssueIds = relationIssueIds
          ? relationIssueIds.filter((id) => withoutAgent.includes(id))
          : withoutAgent;
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
    // A confirmed bug that went through the fix/deploy path must not be
    // reported as resolved until the release has a successful health
    // checkpoint.  This guard runs before WhatsApp side effects, so a retry
    // cannot accidentally tell a customer that an unhealthy deployment is
    // fixed.  Non-bug/notify cases intentionally remain resolvable without a
    // deployment health check.
    const bugCase = await this.privilegedClient
      .from("bug_cases")
      .select("id, stage, decision, health_status, customer_response_status")
      .eq("workspace_id", context.workspaceId)
      .eq("issue_id", current.id)
      .maybeSingle();
    const bugCaseData = checked("bug_cases.resolve_gate", bugCase);
    const bugCaseState = bugCaseData ? row(bugCaseData) : undefined;
    const bugCaseStage = bugCaseState ? str(bugCaseState.stage) : "";
    if (
      bugCaseData &&
      ["autofix", "manual_fix"].includes(str(bugCaseState?.decision)) &&
      str(bugCaseState?.customer_response_status) !== "sent" &&
      str(bugCaseState?.health_status) !== "healthy"
    ) {
      throw new Error(
        `bug_loop_health_required:${bugCaseStage}:${str(bugCaseState?.health_status)}`,
      );
    }
    if (
      bugCaseData &&
      !["decision", "customer_response", "completed"].includes(bugCaseStage)
    ) {
      throw new Error(
        `bug_loop_not_ready_for_customer_response:${bugCaseStage}`,
      );
    }
    let notifiedAt: string | undefined =
      typeof current.customer_notified_at === "string"
        ? current.customer_notified_at
        : undefined;
    if (
      input.notifyCustomer &&
      input.message &&
      current.conversation_id &&
      !notifiedAt
    ) {
      await this.whatsapp.sendText(
        {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorType: "user",
        },
        str(current.conversation_id),
        {
          text: input.message,
          idempotencyKey: `mend:customer-response:${current.id}`,
        },
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
      await this.client.from("timeline_events").upsert(
        {
          workspace_id: context.workspaceId,
          entity_type: "issue",
          entity_id: current.id,
          event_type: "issue.resolved",
          actor_type: "user",
          actor_user_id: context.userId,
          metadata_json: { customerNotified: Boolean(notifiedAt) },
          dedupe_key: `issue:${current.id}:resolved:${context.userId}`,
        },
        { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true },
      ),
    );
    if (bugCaseData && bugCaseStage !== "completed") {
      const bugCaseId = str(bugCaseState?.id);
      const customerResponseStatus = notifiedAt ? "sent" : "skipped";
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: "customer_response",
        eventType: "customer.response_completed",
        message: notifiedAt
          ? "The customer was notified after the fix was released."
          : "The issue was resolved without sending a customer message.",
        idempotencyKey: `customer-response:${current.id}`,
        customerResponseStatus,
        metadata: { issueId: str(current.id), notifiedAt: notifiedAt ?? null },
      });
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: "completed",
        status: "completed",
        eventType: "bug_loop.completed",
        message: "The complaint-to-resolution loop is complete.",
        idempotencyKey: `completed:${current.id}`,
        customerResponseStatus,
        metadata: { issueId: str(current.id) },
      });
    }
    return result.data
      ? issue(await this.details(context, row(result.data)))
      : null;
  }
}

type KanbanTable = "issues" | "personal_tasks";

function personalTaskRecord(value: Row) {
  return {
    id: str(value.id),
    workspaceId: str(value.workspace_id),
    userId: str(value.user_id),
    title: str(value.title),
    notes: value.notes == null ? null : str(value.notes),
    status: str(value.status),
    dueOn: value.due_on == null ? null : str(value.due_on),
    kanbanPosition: Number(value.kanban_position ?? 0),
    completedAt: value.completed_at == null ? null : str(value.completed_at),
    createdAt: str(value.created_at),
    updatedAt: str(value.updated_at),
  };
}

function personalEventRecord(value: Row) {
  return {
    id: str(value.id),
    workspaceId: str(value.workspace_id),
    userId: str(value.user_id),
    title: str(value.title),
    startsAt: str(value.starts_at),
    endsAt: value.ends_at == null ? null : str(value.ends_at),
    allDay: value.all_day === true,
    location: value.location == null ? null : str(value.location),
    createdAt: str(value.created_at),
    updatedAt: str(value.updated_at),
  };
}

async function rebalanceBoard(
  client: AnySupabaseClient,
  table: KanbanTable,
  workspaceId: string,
  status: string,
  userId?: string,
) {
  let query = client
    .from(table as never)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("kanban_position", { ascending: true });
  if (userId) query = query.eq("user_id", userId);
  const records = rows(checked(`kanban.${table}.rebalance.list`, await query));
  for (const [index, record] of records.entries()) {
    const recordId = str((record as Record<string, unknown>).id);
    let update = client
      .from(table as never)
      .update({ kanban_position: (index + 1) * 1024 })
      .eq("id", recordId)
      .eq("workspace_id", workspaceId);
    if (userId) update = update.eq("user_id", userId);
    checked(`kanban.${table}.rebalance.update`, await update);
  }
}

async function boardPosition(
  client: AnySupabaseClient,
  table: KanbanTable,
  workspaceId: string,
  status: string,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
  currentId: string,
  userId?: string,
): Promise<number> {
  const neighborIds = [beforeId, afterId].filter((value): value is string =>
    Boolean(value),
  );
  let neighborsQuery = client
    .from(table as never)
    .select("id,kanban_position,status")
    .eq("workspace_id", workspaceId)
    .in("id", neighborIds);
  if (userId) neighborsQuery = neighborsQuery.eq("user_id", userId);
  const neighborRows = rows(
    checked(`kanban.${table}.neighbors`, await neighborsQuery),
  );
  if (neighborRows.length !== neighborIds.length)
    throw new Error("kanban_order_conflict");
  const byId = new Map(neighborRows.map((value) => [str(value.id), value]));
  const before = beforeId ? byId.get(beforeId) : undefined;
  const after = afterId ? byId.get(afterId) : undefined;
  if (
    (before && str(before.status) !== status) ||
    (after && str(after.status) !== status) ||
    beforeId === currentId ||
    afterId === currentId ||
    (before &&
      after &&
      Number(before.kanban_position) >= Number(after.kanban_position))
  )
    throw new Error("kanban_order_conflict");

  if (before && after) {
    const beforePosition = Number(before.kanban_position);
    const afterPosition = Number(after.kanban_position);
    if (afterPosition - beforePosition < 0.000001) {
      await rebalanceBoard(client, table, workspaceId, status, userId);
      return boardPosition(
        client,
        table,
        workspaceId,
        status,
        beforeId,
        afterId,
        currentId,
        userId,
      );
    }
    return (beforePosition + afterPosition) / 2;
  }
  if (before) return Number(before.kanban_position) + 1024;
  if (after) return Number(after.kanban_position) - 1024;

  let lastQuery = client
    .from(table as never)
    .select("kanban_position")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .neq("id", currentId)
    .order("kanban_position", { ascending: false })
    .limit(1);
  if (userId) lastQuery = lastQuery.eq("user_id", userId);
  const last = rows(checked(`kanban.${table}.last`, await lastQuery))[0];
  return last ? Number(last.kanban_position) + 1024 : 1024;
}

export class SupabaseKanbanAdapter implements KanbanIssuePort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly issues: SupabaseIssueAdapter,
  ) {}

  async move(
    context: RequestContext,
    identifier: string,
    input: KanbanMoveInput,
  ) {
    const currentResult = await this.client
      .from("issues")
      .select("id, status")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const current = checked("issues.kanban.get", currentResult);
    if (!current) return null;
    const position = await boardPosition(
      this.client,
      "issues",
      context.workspaceId,
      input.status,
      input.beforeId,
      input.afterId,
      str((current as Record<string, unknown>).id),
    );
    checked(
      "issues.kanban.move",
      await this.client
        .from("issues")
        .update({
          status: input.status,
          kanban_position: position,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", context.workspaceId)
        .eq("id", (current as Record<string, unknown>).id),
    );
    return this.issues.get(context, identifier);
  }
}

export class SupabasePersonalPlanningAdapter implements PersonalPlanningPort {
  constructor(private readonly client: AnySupabaseClient) {}

  async listTasks(context: RequestContext, query: PersonalTaskListQuery) {
    let request = this.client
      .from("personal_tasks")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId);
    if (query.status) request = request.eq("status", query.status);
    if (query.from) request = request.gte("due_on", query.from);
    if (query.to) request = request.lte("due_on", query.to);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("kanban_position", { ascending: true })
      .limit(query.limit);
    return rows(checked("personal_tasks.list", result)).map(personalTaskRecord);
  }

  async createTask(context: RequestContext, input: PersonalTaskCreateInput) {
    const last = await this.client
      .from("personal_tasks")
      .select("kanban_position")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("status", input.status)
      .order("kanban_position", { ascending: false })
      .limit(1);
    const lastRow = rows(checked("personal_tasks.last", last))[0];
    const now = new Date().toISOString();
    const result = await this.client
      .from("personal_tasks")
      .insert({
        workspace_id: context.workspaceId,
        user_id: context.userId,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        due_on: input.dueOn ?? null,
        kanban_position: lastRow
          ? Number(lastRow.kanban_position) + 1024
          : 1024,
        completed_at: input.status === "done" ? now : null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    return personalTaskRecord(row(checked("personal_tasks.create", result)));
  }

  async updateTask(
    context: RequestContext,
    taskId: string,
    input: PersonalTaskPatchInput,
  ) {
    const updates: Row = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.status !== undefined) {
      updates.status = input.status;
      updates.completed_at =
        input.status === "done" ? new Date().toISOString() : null;
    }
    if (input.dueOn !== undefined) updates.due_on = input.dueOn;
    updates.updated_at = new Date().toISOString();
    const result = await this.client
      .from("personal_tasks")
      .update(updates)
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_tasks.update", result);
    return value ? personalTaskRecord(row(value)) : null;
  }

  async moveTask(
    context: RequestContext,
    taskId: string,
    input: KanbanMoveInput,
  ) {
    const currentResult = await this.client
      .from("personal_tasks")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .maybeSingle();
    const current = checked("personal_tasks.kanban.get", currentResult);
    if (!current) return null;
    const position = await boardPosition(
      this.client,
      "personal_tasks",
      context.workspaceId,
      input.status,
      input.beforeId,
      input.afterId,
      taskId,
      context.userId,
    );
    const result = await this.client
      .from("personal_tasks")
      .update({
        status: input.status,
        kanban_position: position,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_tasks.move", result);
    return value ? personalTaskRecord(row(value)) : null;
  }

  async removeTask(context: RequestContext, taskId: string) {
    const result = await this.client
      .from("personal_tasks")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("id");
    return rows(checked("personal_tasks.delete", result)).length > 0;
  }

  async listEvents(context: RequestContext, query: PersonalEventListQuery) {
    const result = await this.client
      .from("personal_events")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .gte("starts_at", query.from)
      .lt("starts_at", query.to)
      .order("starts_at", { ascending: true })
      .limit(query.limit);
    return rows(checked("personal_events.list", result)).map(
      personalEventRecord,
    );
  }

  async createEvent(context: RequestContext, input: PersonalEventCreateInput) {
    const now = new Date().toISOString();
    const result = await this.client
      .from("personal_events")
      .insert({
        workspace_id: context.workspaceId,
        user_id: context.userId,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        all_day: input.allDay,
        location: input.location ?? null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    return personalEventRecord(row(checked("personal_events.create", result)));
  }

  async updateEvent(
    context: RequestContext,
    eventId: string,
    input: PersonalEventPatchInput,
  ) {
    const updates: Row = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.startsAt !== undefined) updates.starts_at = input.startsAt;
    if (input.endsAt !== undefined) updates.ends_at = input.endsAt;
    if (input.allDay !== undefined) updates.all_day = input.allDay;
    if (input.location !== undefined) updates.location = input.location;
    updates.updated_at = new Date().toISOString();
    const result = await this.client
      .from("personal_events")
      .update(updates)
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", eventId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_events.update", result);
    return value ? personalEventRecord(row(value)) : null;
  }

  async removeEvent(context: RequestContext, eventId: string) {
    const result = await this.client
      .from("personal_events")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", eventId)
      .select("id");
    return rows(checked("personal_events.delete", result)).length > 0;
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

  private async githubBinding(
    context: RequestContext,
    input: RepositoryInput | RepositoryPatchInput,
  ) {
    if (input.githubOwner === undefined && input.githubRepo === undefined)
      return {};
    const result = await this.client
      .from("workspaces")
      .select("github_installation_id, github_owner")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspace = row(
      checked("workspaces.github_repository_binding", result),
    );
    const installationId = String(workspace.github_installation_id ?? "");
    const owner = String(workspace.github_owner ?? "");
    if (!/^\d{1,20}$/.test(installationId) || !owner)
      throw new Error("github_workspace_not_connected");
    if (
      input.githubOwner &&
      input.githubOwner.toLowerCase() !== owner.toLowerCase()
    )
      throw new Error("github_owner_mismatch");
    return {
      githubOwner: owner,
      githubInstallationId: installationId,
    };
  }

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
    const githubBinding = await this.githubBinding(context, input);
    const result = await this.client
      .from("repositories")
      .insert({
        workspace_id: context.workspaceId,
        ...repositoryDbPayload({ ...input, ...githubBinding }),
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
    const githubBinding = await this.githubBinding(context, input);
    const result = await this.client
      .from("repositories")
      .update({
        ...repositoryDbPayload({ ...input, ...githubBinding }),
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

export class SupabaseGitHubConnectionAdapter implements GitHubConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient,
  ) {}

  private setupConfig() {
    const slug = process.env.MEND_GITHUB_APP_SLUG?.trim();
    const secret = process.env.MEND_GITHUB_SETUP_STATE_SECRET?.trim();
    if (!slug || !secret)
      throw new GitHubControlPlaneError(
        "GitHub App setup is not configured on the server",
        503,
        "github_setup_not_configured",
      );
    return { slug, secret };
  }

  private controlPlane() {
    const controlPlane = createGitHubControlPlaneFromEnv();
    if (!controlPlane)
      throw new GitHubControlPlaneError(
        "GitHub App authentication is not configured on the server",
        503,
        "github_app_not_configured",
      );
    return controlPlane;
  }

  async startSetup(context: RequestContext, repositoryId: string) {
    const { slug, secret } = this.setupConfig();
    const repositoryResult = await this.client
      .from("repositories")
      .select("id")
      .eq("id", repositoryId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const repositoryData = checked(
      "repositories.github_setup",
      repositoryResult,
    );
    if (!repositoryData)
      throw new GitHubControlPlaneError(
        "Repository was not found",
        404,
        "repository_not_found",
      );
    const setup = createGitHubSetupState(
      {
        workspaceId: context.workspaceId,
        userId: context.userId,
        repositoryId,
      },
      secret,
    );
    checked(
      "github_setup_states.create",
      await this.privilegedClient.from("github_setup_states").insert({
        state_hash: hashGitHubSetupState(setup.state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        repository_id: repositoryId,
        expires_at: setup.expiresAt,
      }),
    );
    return { installationUrl: githubInstallationUrl(slug, setup.state) };
  }

  async startWorkspaceSetup(context: RequestContext) {
    const { slug, secret } = this.setupConfig();
    const setup = createGitHubSetupState(
      {
        workspaceId: context.workspaceId,
        userId: context.userId,
      },
      secret,
    );
    checked(
      "github_setup_states.create",
      await this.privilegedClient.from("github_setup_states").insert({
        state_hash: hashGitHubSetupState(setup.state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        repository_id: null,
        expires_at: setup.expiresAt,
      }),
    );
    return { installationUrl: githubInstallationUrl(slug, setup.state) };
  }

  async getWorkspaceConnection(context: RequestContext) {
    const result = await this.privilegedClient
      .from("workspaces")
      .select("github_installation_id, github_owner, github_connected_at")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const data = checked("workspaces.github_connection", result);
    const value = row(data);
    return {
      connected: Boolean(value.github_installation_id),
      ...(value.github_owner ? { owner: String(value.github_owner) } : {}),
      ...(value.github_connected_at
        ? { connectedAt: String(value.github_connected_at) }
        : {}),
    };
  }

  async listWorkspaceRepositories(context: RequestContext) {
    const result = await this.privilegedClient
      .from("workspaces")
      .select("github_installation_id")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspace = row(checked("workspaces.github_repositories", result));
    const installationId = Number(workspace.github_installation_id);
    if (!Number.isSafeInteger(installationId) || installationId < 1)
      throw new GitHubControlPlaneError(
        "Connect a GitHub App installation to this workspace first",
        409,
        "github_workspace_not_connected",
      );
    const repositories =
      await this.controlPlane().listInstallationRepositories(installationId);
    return repositories.map((repository) => ({
      owner: repository.owner,
      repo: repository.repo,
      defaultBranch: "main",
    }));
  }

  async disconnectWorkspace(context: RequestContext) {
    const updated = await this.privilegedClient
      .from("workspaces")
      .update({
        github_installation_id: null,
        github_owner: null,
        github_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.workspaceId)
      .select("id");
    const disconnected =
      rows(checked("workspaces.github_disconnect", updated)).length > 0;
    if (!disconnected) return false;
    checked(
      "repositories.github_disconnect",
      await this.privilegedClient
        .from("repositories")
        .update({
          github_installation_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", context.workspaceId),
    );
    return true;
  }

  async completeSetup(query: Record<string, unknown>) {
    const { secret } = this.setupConfig();
    const callback = validateGitHubSetupCallback(query, secret);
    const state = String(query.state ?? "");
    const controlPlane = this.controlPlane();
    const available = await controlPlane.listInstallationRepositories(
      callback.installationId,
    );

    if (!callback.repositoryId) {
      const selectedOwner = available[0]?.owner;
      if (!selectedOwner)
        throw new GitHubControlPlaneError(
          "The GitHub App installation has no repositories available",
          400,
          "github_repositories_empty",
        );
      const consumed = await this.privilegedClient
        .from("github_setup_states")
        .update({ consumed_at: new Date().toISOString() })
        .eq("state_hash", hashGitHubSetupState(state))
        .eq("workspace_id", callback.workspaceId)
        .eq("user_id", callback.userId)
        .is("repository_id", null)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("state_hash")
        .maybeSingle();
      if (!checked("github_setup_states.consume", consumed))
        throw new GitHubControlPlaneError(
          "GitHub setup state was already used or expired",
          400,
          "github_state_replayed",
        );
      const connectedAt = new Date().toISOString();
      const updated = await this.privilegedClient
        .from("workspaces")
        .update({
          github_owner: selectedOwner,
          github_installation_id: String(callback.installationId),
          github_connected_at: connectedAt,
          updated_at: connectedAt,
        })
        .eq("id", callback.workspaceId)
        .select("id")
        .maybeSingle();
      if (!checked("workspaces.github_connected", updated))
        throw new GitHubControlPlaneError(
          "Workspace was not found",
          404,
          "workspace_not_found",
        );

      const configured = rows(
        checked(
          "repositories.github_reconnect",
          await this.privilegedClient
            .from("repositories")
            .select("id, github_owner, github_repo")
            .eq("workspace_id", callback.workspaceId),
        ),
      );
      const availableNames = new Set(
        available.map(
          (item) => `${item.owner.toLowerCase()}/${item.repo.toLowerCase()}`,
        ),
      );
      await Promise.all(
        configured
          .filter(
            (item) =>
              typeof item.github_owner === "string" &&
              typeof item.github_repo === "string" &&
              availableNames.has(
                `${item.github_owner.toLowerCase()}/${item.github_repo.toLowerCase()}`,
              ),
          )
          .map(async (item) =>
            checked(
              "repositories.github_reconnect_update",
              await this.privilegedClient
                .from("repositories")
                .update({
                  github_installation_id: String(callback.installationId),
                  updated_at: connectedAt,
                })
                .eq("id", String(item.id))
                .eq("workspace_id", callback.workspaceId),
            ),
          ),
      );
      return {
        connected: true,
        owner: selectedOwner,
        connectedAt,
        repositoryCount: available.length,
      };
    }

    const repositoryResult = await this.privilegedClient
      .from("repositories")
      .select("*")
      .eq("id", callback.repositoryId)
      .eq("workspace_id", callback.workspaceId)
      .maybeSingle();
    const repositoryData = checked(
      "repositories.github_callback",
      repositoryResult,
    );
    if (!repositoryData)
      throw new GitHubControlPlaneError(
        "Repository was not found",
        404,
        "repository_not_found",
      );
    const configured = repository(row(repositoryData));
    const selected =
      configured.githubOwner && configured.githubRepo
        ? available.find(
            (item) =>
              item.owner.toLowerCase() ===
                configured.githubOwner?.toLowerCase() &&
              item.repo.toLowerCase() === configured.githubRepo?.toLowerCase(),
          )
        : available.length === 1
          ? available[0]
          : undefined;
    if (!selected)
      throw new GitHubControlPlaneError(
        "The configured repository is not available to this GitHub App installation",
        400,
        "github_repository_not_available",
      );
    // Consume only after the installation and repository have been verified.
    // A transient GitHub outage must not burn the one-time setup state and
    // force an administrator to restart the connection flow.
    const consumed = await this.privilegedClient
      .from("github_setup_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", hashGitHubSetupState(state))
      .eq("workspace_id", callback.workspaceId)
      .eq("user_id", callback.userId)
      .eq("repository_id", callback.repositoryId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("state_hash")
      .maybeSingle();
    if (!checked("github_setup_states.consume", consumed))
      throw new GitHubControlPlaneError(
        "GitHub setup state was already used or expired",
        400,
        "github_state_replayed",
      );
    const updated = await this.privilegedClient
      .from("repositories")
      .update({
        github_owner: selected.owner,
        github_repo: selected.repo,
        github_installation_id: String(callback.installationId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", callback.repositoryId)
      .eq("workspace_id", callback.workspaceId)
      .select("*")
      .single();
    return repository(row(checked("repositories.github_connected", updated)));
  }
}

export class SupabaseAgentCredentialAdapter implements AgentCredentialPort {
  constructor(private readonly privilegedClient: AnySupabaseClient) {}

  private record(value: Record<string, unknown>): AgentCredentialRecord {
    return {
      task: String(value.task) as AgentCredentialTask,
      provider: String(value.provider) as AgentProvider,
      configured: true,
      updatedAt: String(value.updated_at ?? ""),
    };
  }

  async list(context: RequestContext): Promise<AgentCredentialRecord[]> {
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .select("task, provider, updated_at")
      .eq("workspace_id", context.workspaceId)
      .order("task", { ascending: true });
    return rows(checked("agent_credentials.list", result)).map((value) =>
      this.record(row(value)),
    );
  }

  async save(
    context: RequestContext,
    input: {
      task: AgentCredentialTask;
      provider: AgentProvider;
      apiKey: string;
      config?: Record<string, unknown>;
    },
  ): Promise<AgentCredentialRecord> {
    const apiKey = input.apiKey.trim();
    if (!apiKey) throw new Error("agent_credential_key_required");
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .upsert(
        {
          workspace_id: context.workspaceId,
          task: input.task,
          provider: input.provider,
          encrypted_api_key: encryptConnectionSecret(
            apiKey,
            connectionEncryptionKey(),
          ),
          config_json: input.config ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,task,provider" },
      )
      .select("task, provider, updated_at")
      .single();
    return this.record(row(checked("agent_credentials.save", result)));
  }

  async remove(
    context: RequestContext,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<boolean> {
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("task", task)
      .eq("provider", provider)
      .select("id");
    const data = checked("agent_credentials.remove", result);
    return rows(data).length > 0;
  }

  async resolve(
    workspaceId: string,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<{ apiKey: string; config: Record<string, unknown> } | null> {
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .select("encrypted_api_key, config_json")
      .eq("workspace_id", workspaceId)
      .eq("task", task)
      .eq("provider", provider)
      .maybeSingle();
    const data = checked("agent_credentials.resolve", result);
    if (!data) return null;
    const value = row(data);
    return {
      apiKey: decryptConnectionSecret(
        String(value.encrypted_api_key),
        connectionEncryptionKey(),
      ),
      config: row(value.config_json),
    };
  }
}

export class SupabaseCodexRunStore implements CodexRunStore {
  constructor(private readonly client: AnySupabaseClient) {}

  async createRun(input: CreateCodexRunInput) {
    if (input.id) {
      const existing = await this.client
        .from("agent_runs")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      const existingData = checked("agent_runs.get_existing", existing);
      if (existingData) {
        const updated = await this.client
          .from("agent_runs")
          .update({
            repository_id: input.repositoryId ?? null,
            mode: input.mode,
            branch_name: input.branchName ?? null,
            created_by_user_id: input.createdByUserId ?? null,
          })
          .eq("id", input.id)
          .select("*")
          .single();
        return run(row(checked("agent_runs.attach", updated)));
      }
    }
    const result = await this.client
      .from("agent_runs")
      .insert({
        ...(input.id ? { id: input.id } : {}),
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
    return run(row(checked("agent_runs.create", result)));
  }
  async getRun(id: string) {
    const result = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const data = checked("agent_runs.get", result);
    return data ? run(row(data)) : null;
  }
  async getRunScoped(id: string, workspaceId: string) {
    const result = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("agent_runs.get_scoped", result);
    return data ? run(row(data)) : null;
  }
  async updateRun(id: string, input: UpdateCodexRunInput) {
    const result = await this.client
      .from("agent_runs")
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
    const data = checked("agent_runs.update", result);
    return data ? run(row(data)) : undefined;
  }
  async appendEvent(
    runId: string,
    input: CodexRunEventInput,
  ): Promise<CodexRunEvent> {
    const current = await this.getRun(runId);
    if (!current) throw new Error("agent_run_not_found");
    const result = await this.client
      .from("agent_run_events")
      .insert({
        workspace_id: current.workspaceId,
        agent_run_id: runId,
        event_type: input.eventType,
        message: redactSecrets(input.message).slice(0, 2_000),
        metadata_json: input.metadata ?? {},
      })
      .select("*")
      .single();
    const value = row(checked("agent_run_events.create", result));
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
  private readonly bugLoop: SupabaseBugLoopStore;

  constructor(
    private readonly client: AnySupabaseClient,
    private readonly repositories: RepositoryConfigPort,
    private readonly store: SupabaseCodexRunStore,
    codexService?: CodexService,
    private readonly privilegedClient: AnySupabaseClient = client,
    private readonly jobStore?: JobStore<WhatsmiauMessageJobPayload>,
  ) {
    this.bugLoop = new SupabaseBugLoopStore(privilegedClient as never);
    this.codex =
      codexService ??
      new CodexService({
        repositories,
        runs: store,
        deployment: createDokployDeploymentFromEnv(),
      });
  }

  async list(context: RequestContext, query: CodingRunListQuery) {
    let request = this.client
      .from("agent_runs")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.issueId) request = request.eq("issue_id", query.issueId);
    if (query.status) request = request.eq("status", query.status);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("agent_runs.list", result)).map(run);
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
    const issueValue = checked("agent_runs.issue", issueResult);
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
    const policy = await this.workspacePolicy(context.workspaceId);
    if (!policy.allowedIntegrations.includes("agent"))
      throw new CodexServiceError(
        "Agent execution is disabled by the workspace AI integration policy",
      );
    const action =
      input.mode === "investigate"
        ? "investigate"
        : input.mode === "propose_fix"
          ? "propose_fix"
          : "implement_fix";
    if (!policy.allowedActions.includes(action))
      throw new CodexServiceError(
        `Agent action ${action} is disabled by the workspace AI policy`,
      );

    const agentContext = await this.loadCodexContext(
      context,
      issue,
      identifier,
      input.instructions,
    );
    const tools: SafeTool[] = (input.commands ?? []).map((name) => ({
      kind: "command",
      name: name as AllowedCommand,
    }));
    const runId = crypto.randomUUID();
    const queued = await this.store.createRun({
      id: runId,
      workspaceId: context.workspaceId,
      issueId: str(issue.id),
      repositoryId: input.repositoryId,
      mode: input.mode,
      createdByUserId: context.userId,
    });
    const request = {
      issueIdentifier: identifier,
      branchBase: input.branchBase ?? "main",
      commands: input.commands ?? [],
      allowChanges: input.allowChanges ?? false,
      ...(input.instructions
        ? { instructions: redactSecrets(input.instructions).slice(0, 20_000) }
        : {}),
    };
    const jobPayload: AgentRunRequestedJobPayload = {
      stage: "agent_run_requested",
      runId,
      workspaceId: context.workspaceId,
      issueId: str(issue.id),
      repositoryId: input.repositoryId,
      issueIdentifier: identifier,
      issueTitle: str(issue.title),
      mode: input.mode,
      context: agentContext,
      tools,
      createdByUserId: context.userId,
    };
    const persisted = await this.store.updateRun(runId, {
      result: { request },
    });
    if (this.jobStore) {
      await (
        this.jobStore as unknown as JobStore<AgentRunRequestedJobPayload>
      ).enqueue({
        workspaceId: context.workspaceId,
        type: AGENT_RUN_REQUESTED_JOB_TYPE,
        payload: jobPayload,
        dedupeKey: `mend:agent-run:${runId}`,
        maxAttempts: 5,
      });
    } else {
      void this.codex
        .start({
          runId,
          workspaceId: context.workspaceId,
          issueId: str(issue.id),
          repositoryId: input.repositoryId,
          issueIdentifier: identifier,
          issueTitle: str(issue.title),
          mode: input.mode,
          context: agentContext,
          tools,
          createdByUserId: context.userId,
        })
        .then((handle) => handle.completion)
        .catch(() => undefined);
    }

    // The Runs retry action creates a fresh run. If the previous case was
    // failed, reopen its durable checkpoint as part of the same request so
    // the new execution is visible in the complaint-to-fix state machine.
    const failedCase = await this.privilegedClient
      .from("bug_cases")
      .select("id, stage")
      .eq("workspace_id", context.workspaceId)
      .eq("issue_id", str(issue.id))
      .eq("stage", "failed")
      .maybeSingle();
    const failedCaseData = checked("bug_cases.retry", failedCase);
    const failedCaseRow = failedCaseData ? row(failedCaseData) : undefined;
    if (failedCaseRow && str(failedCaseRow.id)) {
      const bugCaseId = str(failedCaseRow.id);
      const retryStage: BugLoopStage =
        input.mode === "investigate" ? "investigation" : "fix";
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: retryStage,
        status: "active",
        eventType: "coding_run.retry",
        message: `A new ${input.mode} run was started after the previous attempt failed.`,
        idempotencyKey: `agent-run-retry:${runId}`,
        ...(retryStage === "investigation"
          ? { investigationRunId: runId }
          : { fixRunId: runId }),
        metadata: { runId, mode: input.mode },
      });
    }
    return persisted ?? queued;
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
    const commentRows = rows(checked("agent_runs.issue_comments", comments));
    const messageRows = messages
      ? rows(checked("agent_runs.messages", messages))
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
    const run = await this.scoped(context, id);
    if (!run) return null;
    if (run.mode !== "implement_fix")
      throw new CodexServiceError(
        "Only implement_fix runs can be approved; resolve or notify the customer from the bug case",
      );
    await this.requirePolicyAction(context.workspaceId, "implement_fix");
    const updated = await this.codex.approve(id);
    await this.advanceCaseForRun(context.workspaceId, updated, "approval", {
      eventType: "fix.approved",
      message: "A human approved the verified fix.",
    });
    return updated;
  }
  async publish(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "publish");
    const updated = await this.codex.publish(id);
    const pullRequest = row(row(updated.result).pullRequest);
    await this.advanceCaseForRun(context.workspaceId, updated, "pull_request", {
      eventType: "pull_request.created",
      message: "A draft pull request was created through the GitHub App.",
      ...(pullRequest.url ? { prUrl: str(pullRequest.url) } : {}),
      ...(Number.isSafeInteger(Number(pullRequest.number))
        ? { prNumber: Number(pullRequest.number) }
        : {}),
    });
    return updated;
  }
  async deploy(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "deploy");
    const workspace = await this.client
      .from("workspaces")
      .select("ai_policy_json")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspaceData = checked("agent_runs.deploy_policy", workspace);
    const workspaceRow = workspaceData ? row(workspaceData) : null;
    if (
      !workspaceRow ||
      !normalizeWorkspaceAiPolicy(workspaceRow.ai_policy_json)
        .bugAutoDeployEnabled
    )
      throw new Error("deployment_not_enabled_in_ai_policy");
    const updated = await this.codex.deploy(id);
    const deployment = row(row(updated.result).deployment);
    await this.advanceCaseForRun(context.workspaceId, updated, "deploy", {
      eventType: "deployment.started",
      message: "The approved fix was sent to the deployment provider.",
      ...(deployment.url ? { deploymentUrl: str(deployment.url) } : {}),
    });
    return updated;
  }
  async merge(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "publish");
    const updated = await this.codex.merge(id);
    const merge = row(row(updated.result).merge);
    await this.advanceCaseForRun(context.workspaceId, updated, "merge", {
      eventType: "pull_request.merged",
      message: "The approved pull request was merged through the GitHub App.",
      mergeSha: str(merge.sha),
    });
    return updated;
  }
  async health(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    const updated = await this.codex.verifyHealth(id);
    const result = row(updated.result);
    const healthStatus =
      result.healthStatus === "healthy" ? "healthy" : "unhealthy";
    await this.advanceCaseForRun(context.workspaceId, updated, "health_check", {
      eventType: `deployment.health_${healthStatus}`,
      message:
        healthStatus === "healthy"
          ? "The deployed fix passed its health check."
          : "The deployed fix failed its health check and needs attention.",
      healthStatus,
    });
    return updated;
  }
  async reject(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.reject(id);
  }

  private async workspacePolicy(workspaceId: string) {
    const result = await this.client
      .from("workspaces")
      .select("ai_policy_json")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("agent_runs.ai_policy", result);
    return normalizeWorkspaceAiPolicy(row(data ?? {}).ai_policy_json);
  }

  private async requirePolicyAction(
    workspaceId: string,
    action: "implement_fix" | "publish" | "deploy",
  ) {
    const policy = await this.workspacePolicy(workspaceId);
    if (!policy.allowedActions.includes(action))
      throw new CodexServiceError(
        `AI action ${action} is disabled by the workspace AI policy`,
      );
  }
  private async advanceCaseForRun(
    workspaceId: string,
    runRecord: import("./codex.js").CodexRunRecord,
    stage: BugLoopStage,
    details: {
      eventType: string;
      message: string;
      prUrl?: string;
      prNumber?: number;
      deploymentUrl?: string;
      mergeSha?: string;
      healthStatus?: "healthy" | "unhealthy";
    },
  ): Promise<void> {
    const column =
      runRecord.mode === "investigate"
        ? "investigation_agent_run_id"
        : "fix_agent_run_id";
    const result = await this.privilegedClient
      .from("bug_cases")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq(column, runRecord.id)
      .maybeSingle();
    const data = checked("bug_cases.run", result);
    if (!data) return;
    const bugCaseId = str(row(data).id);
    await this.bugLoop.advance({
      workspaceId,
      bugCaseId,
      stage,
      eventType: details.eventType,
      message: details.message,
      idempotencyKey: `${details.eventType}:${runRecord.id}`,
      metadata: { runId: runRecord.id },
      ...(details.prUrl ? { prUrl: details.prUrl } : {}),
      ...(details.prNumber ? { prNumber: details.prNumber } : {}),
      ...(details.deploymentUrl
        ? { deploymentUrl: details.deploymentUrl }
        : {}),
      ...(details.mergeSha ? { mergeSha: details.mergeSha } : {}),
      ...(details.healthStatus ? { healthStatus: details.healthStatus } : {}),
    });
  }
  async patch(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    const diff = await this.codex.getDiff(id);
    return { patch: diff.patch, truncated: diff.truncated };
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function googleCalendars(value: unknown): GoogleCalendarSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.summary !== "string")
      return [];
    return [
      {
        id: record.id,
        summary: record.summary,
        ...(typeof record.description === "string"
          ? { description: record.description.slice(0, 2_000) }
          : {}),
        primary: record.primary === true,
        accessRole:
          typeof record.accessRole === "string" ? record.accessRole : "reader",
        ...(typeof record.timeZone === "string"
          ? { timeZone: record.timeZone }
          : {}),
      },
    ];
  });
}

function googleConnection(rowValue: Row): GoogleConnectionRecord {
  const calendars = googleCalendars(rowValue.calendars_json);
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    googleAccountId: str(rowValue.google_account_id),
    accountEmail: str(rowValue.account_email) || null,
    accountName: str(rowValue.account_name) || null,
    status: (str(rowValue.status) ||
      "error") as GoogleConnectionRecord["status"],
    scopes: stringArray(rowValue.scopes_json),
    calendars,
    selectedCalendarIds: stringArray(rowValue.selected_calendar_ids_json),
    lastError: str(rowValue.last_error) || null,
    lastSyncedAt: str(rowValue.last_synced_at) || null,
    createdAt: str(rowValue.created_at),
    updatedAt: str(rowValue.updated_at),
  };
}

async function googleJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok || !body || typeof body !== "object")
    throw new GoogleConnectionError(
      502,
      "google_provider_unavailable",
      `Google ${label} request failed.`,
    );
  return body as Record<string, unknown>;
}

export class SupabaseGoogleConnectionAdapter implements GoogleConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {}

  async list(context: { workspaceId: string }) {
    const result = await this.client
      .from("google_connections")
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .eq("workspace_id", context.workspaceId)
      .order("updated_at", { ascending: false });
    return rows(checked("google_connections.list", result)).map(
      googleConnection,
    );
  }

  async startOAuth(context: { workspaceId: string; userId: string }) {
    const config = requireGoogleOAuthConfig();
    const { state, expiresAt } = createGoogleOAuthState(
      context.workspaceId,
      context.userId,
      config.tokenEncryptionKey,
    );
    const result = await this.privilegedClient
      .from("google_oauth_states")
      .insert({
        state_hash: hashGoogleOAuthState(state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    checked("google_oauth_states.create", result);
    return { oauthUrl: googleAuthorizationUrl(config, state) };
  }

  async completeOAuth(code: string, state: string) {
    const config = requireGoogleOAuthConfig();
    const signed = verifyGoogleOAuthState(state, config.tokenEncryptionKey);
    const stateResult = await this.privilegedClient
      .from("google_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", hashGoogleOAuthState(state))
      .eq("workspace_id", signed.workspaceId)
      .eq("user_id", signed.userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (!checked("google_oauth_states.consume", stateResult))
      throw new GoogleConnectionError(
        400,
        "google_oauth_state_used",
        "Google OAuth state is invalid, expired or already used.",
      );

    const tokenBody = await googleJson(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
        }),
      },
      "token exchange",
    );
    const accessToken =
      typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
    if (!accessToken)
      throw new GoogleConnectionError(
        502,
        "google_token_missing",
        "Google did not return an access token.",
      );
    const userInfo = await googleJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${accessToken}` } },
      "account lookup",
    );
    const calendarBody = await googleJson(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
      { headers: { authorization: `Bearer ${accessToken}` } },
      "calendar lookup",
    );
    const googleAccountId =
      typeof userInfo.sub === "string"
        ? userInfo.sub
        : typeof userInfo.email === "string"
          ? userInfo.email
          : "";
    if (!googleAccountId)
      throw new GoogleConnectionError(
        502,
        "google_account_missing",
        "Google did not return an account identifier.",
      );
    const calendars = googleCalendars(calendarBody.items);
    const existingResult = await this.privilegedClient
      .from("google_connections")
      .select("id, selected_calendar_ids_json")
      .eq("workspace_id", signed.workspaceId)
      .eq("google_account_id", googleAccountId)
      .maybeSingle();
    const existing = checked("google_connections.existing", existingResult);
    const selected = stringArray(
      existing && typeof existing === "object"
        ? (existing as Row).selected_calendar_ids_json
        : undefined,
    ).filter((id) => calendars.some((calendar) => calendar.id === id));
    const selectedCalendarIds = selected.length
      ? selected
      : calendars
          .filter((calendar) => calendar.primary)
          .map((calendar) => calendar.id);
    const scopes =
      typeof tokenBody.scope === "string"
        ? tokenBody.scope.split(" ").filter(Boolean)
        : [...googleCalendarScopes];
    const connectionResult = await this.privilegedClient
      .from("google_connections")
      .upsert(
        {
          workspace_id: signed.workspaceId,
          google_account_id: googleAccountId,
          account_email:
            typeof userInfo.email === "string" ? userInfo.email : null,
          account_name:
            typeof userInfo.name === "string"
              ? userInfo.name
              : typeof userInfo.email === "string"
                ? userInfo.email
                : null,
          status: "connected",
          scopes_json: scopes,
          calendars_json: calendars,
          selected_calendar_ids_json: selectedCalendarIds,
          last_error: null,
          last_synced_at: new Date().toISOString(),
          created_by_user_id: signed.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,google_account_id" },
      )
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .single();
    const connection = googleConnection(
      row(checked("google_connections.upsert", connectionResult)),
    );
    const expiresIn = Number(tokenBody.expires_in);
    const secretResult = await this.privilegedClient
      .from("google_connection_secrets")
      .upsert(
        {
          connection_id: connection.id,
          access_token_encrypted: encryptGoogleToken(
            accessToken,
            config.tokenEncryptionKey,
          ),
          refresh_token_encrypted:
            typeof tokenBody.refresh_token === "string"
              ? encryptGoogleToken(
                  tokenBody.refresh_token,
                  config.tokenEncryptionKey,
                )
              : null,
          token_expires_at: Number.isFinite(expiresIn)
            ? new Date(Date.now() + expiresIn * 1_000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    checked("google_connection_secrets.upsert", secretResult);
    const auditResult = await this.privilegedClient.from("audit_log").insert({
      workspace_id: signed.workspaceId,
      actor_user_id: signed.userId,
      action: "google.connection_connected",
      entity_type: "google_connection",
      entity_id: connection.id,
      metadata_json: { provider: "google", calendarCount: calendars.length },
    });
    checked("audit_log.google_connection_connected", auditResult);
    return connection;
  }

  async updateCalendars(
    context: { workspaceId: string; userId: string },
    connectionId: string,
    selectedCalendarIds: string[],
  ) {
    const currentResult = await this.client
      .from("google_connections")
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const current = checked("google_connections.get", currentResult);
    if (!current) return null;
    const calendars = googleCalendars(row(current).calendars_json);
    const allowed = new Set(calendars.map((calendar) => calendar.id));
    if (selectedCalendarIds.some((id) => !allowed.has(id)))
      throw new GoogleConnectionError(
        400,
        "invalid_calendar_selection",
        "One or more selected calendars do not belong to this Google connection.",
      );
    const result = await this.client
      .from("google_connections")
      .update({
        selected_calendar_ids_json: [...new Set(selectedCalendarIds)],
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .maybeSingle();
    const updated = checked("google_connections.update_calendars", result);
    if (!updated) return null;
    const auditResult = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action: "google.connection_calendars_updated",
      entity_type: "google_connection",
      entity_id: connectionId,
      metadata_json: { selectedCalendarCount: selectedCalendarIds.length },
    });
    checked("audit_log.google_connection_calendars_updated", auditResult);
    return googleConnection(row(updated));
  }

  async disconnect(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const result = await this.client
      .from("google_connections")
      .update({
        status: "disconnected",
        selected_calendar_ids_json: [],
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .maybeSingle();
    const updated = checked("google_connections.disconnect", result);
    if (!updated) return null;
    const config = (() => {
      try {
        return requireGoogleOAuthConfig();
      } catch {
        return null;
      }
    })();
    const secretResult = await this.privilegedClient
      .from("google_connection_secrets")
      .select("access_token_encrypted, refresh_token_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const secret = checked("google_connection_secrets.get", secretResult);
    const encryptedToken =
      secret && typeof secret === "object"
        ? ((secret as Row).refresh_token_encrypted ??
          (secret as Row).access_token_encrypted)
        : null;
    if (config && typeof encryptedToken === "string") {
      try {
        const token = decryptGoogleToken(
          encryptedToken,
          config.tokenEncryptionKey,
        );
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      } catch {
        // Local credentials are still deleted below; a later reconnect can re-authorize.
      }
    }
    await this.privilegedClient
      .from("google_connection_secrets")
      .delete()
      .eq("connection_id", connectionId);
    const auditResult = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action: "google.connection_disconnected",
      entity_type: "google_connection",
      entity_id: connectionId,
      metadata_json: { provider: "google" },
    });
    checked("audit_log.google_connection_disconnected", auditResult);
    return googleConnection(row(updated));
  }
}

const mcpConnectionSelect =
  "id, workspace_id, name, description, server_url, auth_mode, status, tools_json, allowed_tool_names_json, write_modes_json, last_error, last_tested_at, created_at, updated_at";

export class SupabaseMcpConnectionAdapter implements McpConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {}

  async list(context: { workspaceId: string }) {
    const result = await this.client
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("workspace_id", context.workspaceId)
      .order("updated_at", { ascending: false });
    return rows(checked("mcp_connections.list", result)).map((value) =>
      mcpConnectionRecordFromRow(value),
    );
  }

  async create(
    context: { workspaceId: string; userId: string },
    input: McpConnectionInput,
  ) {
    const serverUrl = validateMcpServerUrl(input.serverUrl);
    const authMode = input.authMode ?? "none";
    if (!["none", "headers", "oauth"].includes(authMode))
      throw new McpConnectionError(
        400,
        "mcp_auth_mode_invalid",
        "MCP authentication mode is invalid.",
      );
    const headers = validateMcpHeaders(input.headers);
    if (authMode === "headers" && !Object.keys(headers).length)
      throw new McpConnectionError(
        400,
        "mcp_headers_required",
        "At least one MCP header is required.",
      );
    if (authMode === "oauth" && headers && Object.keys(headers).length)
      throw new McpConnectionError(
        400,
        "mcp_oauth_headers_conflict",
        "OAuth connections cannot also define manual headers.",
      );
    const result = await this.privilegedClient
      .from("mcp_connections")
      .insert({
        workspace_id: context.workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        server_url: serverUrl,
        auth_mode: authMode,
        status: authMode === "oauth" ? "pending" : "connected",
        created_by_user_id: context.userId,
      })
      .select(mcpConnectionSelect)
      .single();
    const connection = mcpConnectionRecordFromRow(
      row(checked("mcp_connections.create", result)),
    );
    if (authMode === "headers") {
      await this.privilegedClient.from("mcp_connection_secrets").upsert(
        {
          connection_id: connection.id,
          headers_encrypted: encryptMcpSecret(
            JSON.stringify(headers),
            connectionEncryptionKey(),
          ),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    }
    if (authMode === "oauth" && (input.clientId || input.clientSecret)) {
      await this.privilegedClient.from("mcp_connection_secrets").upsert(
        {
          connection_id: connection.id,
          ...(input.clientId
            ? {
                client_id_encrypted: encryptMcpSecret(
                  input.clientId,
                  connectionEncryptionKey(),
                ),
              }
            : {}),
          ...(input.clientSecret
            ? {
                client_secret_encrypted: encryptMcpSecret(
                  input.clientSecret,
                  connectionEncryptionKey(),
                ),
              }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    }
    await this.audit(context, "mcp.connection_created", connection.id, {
      authMode,
      serverHost: new URL(serverUrl).host,
    });
    const tested =
      authMode === "oauth"
        ? connection
        : await this.test(context, connection.id);
    return { connection: tested ?? connection };
  }

  async update(
    context: { workspaceId: string; userId: string },
    connectionId: string,
    input: McpConnectionPatch,
  ) {
    const current = await this.get(context.workspaceId, connectionId);
    if (!current) return null;
    const allowed = input.allowedToolNames
      ? [...new Set(input.allowedToolNames)].filter((name) =>
          current.tools.some((tool) => tool.name === name),
        )
      : undefined;
    const writeModes = input.writeModes
      ? [...new Set(input.writeModes)].filter(
          (mode): mode is McpAiMode => mode === "draft" || mode === "safe_auto",
        )
      : undefined;
    const result = await this.client
      .from("mcp_connections")
      .update({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(allowed !== undefined ? { allowed_tool_names_json: allowed } : {}),
        ...(writeModes !== undefined ? { write_modes_json: writeModes } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const updated = checked("mcp_connections.update", result);
    if (!updated) return null;
    await this.audit(context, "mcp.connection_updated", connectionId, {
      allowedToolCount: allowed?.length,
      writeModes,
    });
    return mcpConnectionRecordFromRow(row(updated));
  }

  async test(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const current = await this.get(context.workspaceId, connectionId);
    if (!current) return null;
    try {
      const headers = await this.headersFor(connectionId, current.authMode);
      const tools = await discoverMcpTools(current.serverUrl, headers);
      const result = await this.client
        .from("mcp_connections")
        .update({
          status: "connected",
          tools_json: tools,
          last_error: null,
          last_tested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId)
        .select(mcpConnectionSelect)
        .maybeSingle();
      const updated = checked("mcp_connections.test", result);
      if (!updated) return null;
      await this.audit(context, "mcp.connection_tested", connectionId, {
        toolCount: tools.length,
      });
      return mcpConnectionRecordFromRow(row(updated));
    } catch (error) {
      const message = sanitizeMcpError(error);
      await this.client
        .from("mcp_connections")
        .update({
          status: "error",
          last_error: message,
          last_tested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId);
      throw new McpConnectionError(
        502,
        "mcp_connection_failed",
        "MCP connection test failed.",
      );
    }
  }

  async startOAuth(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ): Promise<{ oauthUrl: string }> {
    const connection = await this.get(context.workspaceId, connectionId);
    if (!connection)
      throw new McpConnectionError(
        404,
        "mcp_connection_not_found",
        "MCP connection not found.",
      );
    if (connection.authMode !== "oauth")
      throw new McpConnectionError(
        400,
        "mcp_oauth_mode_required",
        "This connection does not use OAuth.",
      );
    const info = await discoverOAuthServerInfo(connection.serverUrl);
    const baseUrl =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!baseUrl)
      throw new McpConnectionError(
        503,
        "mcp_oauth_base_url_missing",
        "APP_BASE_URL is required for MCP OAuth.",
      );
    const redirectUrl = new URL(
      "/api/mcp/connections/oauth/callback",
      baseUrl,
    ).toString();
    const clientInformation = await this.oauthClientInformation(
      connectionId,
      redirectUrl,
    );
    const state = crypto.randomBytes(24).toString("base64url");
    const started = await startAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation,
      redirectUrl,
      scope: info.resourceMetadata?.scopes_supported?.join(" "),
      state,
      resource: info.resourceMetadata?.resource
        ? new URL(info.resourceMetadata.resource)
        : new URL(connection.serverUrl),
    });
    await this.privilegedClient.from("mcp_oauth_states").insert({
      state_hash: crypto.createHash("sha256").update(state).digest("hex"),
      connection_id: connectionId,
      workspace_id: context.workspaceId,
      user_id: context.userId,
      verifier_encrypted: encryptMcpSecret(
        started.codeVerifier,
        connectionEncryptionKey(),
      ),
      issuer:
        info.authorizationServerMetadata?.issuer ??
        String(info.authorizationServerUrl),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    await this.audit(context, "mcp.oauth_started", connectionId, {
      issuer:
        info.authorizationServerMetadata?.issuer ??
        String(info.authorizationServerUrl),
    });
    return { oauthUrl: started.authorizationUrl.toString() };
  }

  async completeOAuth(
    code: string,
    state: string,
  ): Promise<McpConnectionRecord> {
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const stateResult = await this.privilegedClient
      .from("mcp_oauth_states")
      .select("*")
      .eq("state_hash", stateHash)
      .maybeSingle();
    const stateRow = checked("mcp_oauth_states.get", stateResult);
    if (
      !stateRow ||
      new Date(str(row(stateRow).expires_at)).getTime() < Date.now() ||
      row(stateRow).consumed_at
    )
      throw new McpConnectionError(
        400,
        "mcp_oauth_state_invalid",
        "MCP OAuth state is invalid or expired.",
      );
    const stateValue = row(stateRow);
    const connectionResult = await this.privilegedClient
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("id", str(stateValue.connection_id))
      .eq("workspace_id", str(stateValue.workspace_id))
      .maybeSingle();
    const connectionData = checked("mcp_connections.oauth", connectionResult);
    if (!connectionData)
      throw new McpConnectionError(
        404,
        "mcp_connection_not_found",
        "MCP connection not found.",
      );
    const connection = mcpConnectionRecordFromRow(row(connectionData));
    const baseUrl =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!baseUrl)
      throw new McpConnectionError(
        503,
        "mcp_oauth_base_url_missing",
        "APP_BASE_URL is required for MCP OAuth.",
      );
    const redirectUrl = new URL(
      "/api/mcp/connections/oauth/callback",
      baseUrl,
    ).toString();
    const info = await discoverOAuthServerInfo(connection.serverUrl);
    const discoveredIssuer =
      info.authorizationServerMetadata?.issuer ??
      String(info.authorizationServerUrl);
    if (str(stateValue.issuer) && str(stateValue.issuer) !== discoveredIssuer)
      throw new McpConnectionError(
        400,
        "mcp_oauth_issuer_invalid",
        "MCP OAuth issuer changed during authorization.",
      );
    const clientInformation = await this.oauthClientInformation(
      connection.id,
      redirectUrl,
    );
    const verifier = decryptMcpSecret(
      str(stateValue.verifier_encrypted),
      connectionEncryptionKey(),
    );
    const tokens = await exchangeAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation,
      authorizationCode: code,
      codeVerifier: verifier,
      redirectUri: redirectUrl,
      resource: info.resourceMetadata?.resource
        ? new URL(info.resourceMetadata.resource)
        : new URL(connection.serverUrl),
    });
    await this.saveOAuthTokens(connection.id, tokens);
    await this.privilegedClient
      .from("mcp_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", stateHash);
    const tools = await discoverMcpTools(connection.serverUrl, {
      Authorization: `Bearer ${tokens.access_token}`,
    });
    const updated = await this.privilegedClient
      .from("mcp_connections")
      .update({
        status: "connected",
        tools_json: tools,
        last_error: null,
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const result = checked("mcp_connections.oauth_complete", updated);
    if (!result)
      throw new McpConnectionError(
        500,
        "mcp_oauth_connection_missing",
        "MCP connection disappeared during OAuth.",
      );
    return mcpConnectionRecordFromRow(row(result));
  }

  async disconnect(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const result = await this.client
      .from("mcp_connections")
      .update({
        status: "disconnected",
        allowed_tool_names_json: [],
        write_modes_json: [],
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const updated = checked("mcp_connections.disconnect", result);
    if (!updated) return null;
    await this.privilegedClient
      .from("mcp_connection_secrets")
      .delete()
      .eq("connection_id", connectionId);
    await this.audit(context, "mcp.connection_disconnected", connectionId, {});
    return mcpConnectionRecordFromRow(row(updated));
  }

  private async get(workspaceId: string, connectionId: string) {
    const result = await this.client
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("id", connectionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const value = checked("mcp_connections.get", result);
    return value ? mcpConnectionRecordFromRow(row(value)) : null;
  }

  private async headersFor(connectionId: string, authMode: McpAuthMode) {
    if (authMode === "oauth") {
      const result = await this.privilegedClient
        .from("mcp_connection_secrets")
        .select(
          "access_token_encrypted, refresh_token_encrypted, token_expires_at",
        )
        .eq("connection_id", connectionId)
        .maybeSingle();
      const secret = checked("mcp_connection_secrets.oauth", result);
      const encrypted =
        secret && typeof secret === "object"
          ? (secret as Row).access_token_encrypted
          : null;
      if (typeof encrypted !== "string") return {};
      const expiresAt = str((secret as Row).token_expires_at);
      if (!expiresAt || new Date(expiresAt).getTime() > Date.now() + 60_000)
        return {
          Authorization: `Bearer ${decryptMcpSecret(encrypted, connectionEncryptionKey())}`,
        };
      const refreshEncrypted = (secret as Row).refresh_token_encrypted;
      if (typeof refreshEncrypted !== "string")
        return {
          Authorization: `Bearer ${decryptMcpSecret(encrypted, connectionEncryptionKey())}`,
        };
      const connectionResult = await this.privilegedClient
        .from("mcp_connections")
        .select("server_url")
        .eq("id", connectionId)
        .maybeSingle();
      const connectionRow = checked(
        "mcp_connections.oauth_refresh",
        connectionResult,
      );
      if (!connectionRow) return {};
      const serverUrl = str(row(connectionRow).server_url);
      const info = await discoverOAuthServerInfo(serverUrl);
      const baseUrl =
        process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
      if (!baseUrl) return {};
      const redirectUrl = new URL(
        "/api/mcp/connections/oauth/callback",
        baseUrl,
      ).toString();
      const clientInformation = await this.oauthClientInformation(
        connectionId,
        redirectUrl,
      );
      const tokens = await refreshAuthorization(info.authorizationServerUrl, {
        metadata: info.authorizationServerMetadata,
        clientInformation,
        refreshToken: decryptMcpSecret(
          refreshEncrypted,
          connectionEncryptionKey(),
        ),
        resource: info.resourceMetadata?.resource
          ? new URL(info.resourceMetadata.resource)
          : new URL(serverUrl),
      });
      await this.saveOAuthTokens(connectionId, tokens);
      return { Authorization: `Bearer ${tokens.access_token}` };
    }
    if (authMode !== "headers") return {};
    const result = await this.privilegedClient
      .from("mcp_connection_secrets")
      .select("headers_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const secret = checked("mcp_connection_secrets.get", result);
    const encrypted =
      secret && typeof secret === "object"
        ? (secret as Row).headers_encrypted
        : null;
    if (typeof encrypted !== "string") return {};
    const value = JSON.parse(
      decryptMcpSecret(encrypted, connectionEncryptionKey()),
    ) as unknown;
    return validateMcpHeaders(value as Record<string, string>);
  }

  private async oauthClientInformation(
    connectionId: string,
    redirectUrl: string,
  ): Promise<OAuthClientInformationMixed> {
    const result = await this.privilegedClient
      .from("mcp_connection_secrets")
      .select("client_id_encrypted, client_secret_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const value = checked("mcp_connection_secrets.oauth_client", result);
    const rowValue = value && typeof value === "object" ? (value as Row) : {};
    const clientId =
      typeof rowValue.client_id_encrypted === "string"
        ? decryptMcpSecret(
            rowValue.client_id_encrypted,
            connectionEncryptionKey(),
          )
        : new URL(
            "/api/mcp/oauth/client-metadata.json",
            redirectUrl,
          ).toString();
    const clientSecret =
      typeof rowValue.client_secret_encrypted === "string"
        ? decryptMcpSecret(
            rowValue.client_secret_encrypted,
            connectionEncryptionKey(),
          )
        : undefined;
    return {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uris: [new URL(redirectUrl)],
    } as OAuthClientInformationMixed;
  }

  private async saveOAuthTokens(
    connectionId: string,
    tokens: OAuthTokens,
  ): Promise<void> {
    await this.privilegedClient.from("mcp_connection_secrets").upsert(
      {
        connection_id: connectionId,
        access_token_encrypted: encryptMcpSecret(
          tokens.access_token,
          connectionEncryptionKey(),
        ),
        ...(tokens.refresh_token
          ? {
              refresh_token_encrypted: encryptMcpSecret(
                tokens.refresh_token,
                connectionEncryptionKey(),
              ),
            }
          : {}),
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    );
  }

  private async audit(
    context: { workspaceId: string; userId: string },
    action: string,
    connectionId: string,
    metadata: Record<string, unknown>,
  ) {
    const result = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action,
      entity_type: "mcp_connection",
      entity_id: connectionId,
      metadata_json: metadata,
    });
    checked(`audit_log.${action}`, result);
  }
}

export function createSupabaseApiAdapters(
  options: SupabaseApiAdapterOptions = {},
): SupabaseApiPortDependencies {
  const client = requireClient(
    options.client ?? createServerSupabaseClient(options.accessToken),
  );
  const privilegedClient = options.privilegedClient ?? client;
  const workspacePrivilegedClient = options.invitationClient ?? null;
  const provider =
    options.whatsMiau ??
    (new WhatsmiauMessagingProvider() as WhatsmiauProviderPort);
  const ai = options.aiProvider ?? createSupportAiProvider();
  const membership = new SupabaseMembershipAdapter(client);
  const workspaces = new SupabaseWorkspaceAdapter(
    client,
    workspacePrivilegedClient,
  );
  const channels = new SupabaseChannelAdapter(client, provider);
  const mediaStorage = new SupabaseMediaStorage(client);
  const media = new SupabaseMediaPipeline(
    client,
    options.jobStore as unknown as import("./media-pipeline.js").MediaJobEnqueuer,
  );
  const agentCredentials = new SupabaseAgentCredentialAdapter(privilegedClient);
  const conversations = new SupabaseConversationAdapter(
    client,
    provider,
    ai,
    mediaStorage,
    media,
    agentCredentials,
  );
  const issues = new SupabaseIssueAdapter(
    client,
    provider,
    mediaStorage,
    privilegedClient,
  );
  const kanban = new SupabaseKanbanAdapter(client, issues);
  const personalPlanning = new SupabasePersonalPlanningAdapter(client);
  const knowledge = new SupabaseKnowledgeAdapter(client);
  const repositories = new SupabaseRepositoryAdapter(client);
  const githubConnections = new SupabaseGitHubConnectionAdapter(
    client,
    privilegedClient,
  );
  const store = new SupabaseCodexRunStore(client);
  const codingRuns = new SupabaseCodingRunAdapter(
    client,
    repositories,
    store,
    options.codexService,
    privilegedClient,
    options.jobStore,
  );
  const googleConnections = new SupabaseGoogleConnectionAdapter(
    client,
    privilegedClient,
  );
  const mcpConnections = new SupabaseMcpConnectionAdapter(
    client,
    privilegedClient,
  );
  return {
    membership,
    workspaces,
    channels,
    conversations,
    issues,
    knowledge,
    repositories,
    agentCredentials,
    githubConnections,
    codingRuns,
    googleConnections,
    mcpConnections,
    media,
    kanban,
    personalPlanning,
  };
}

export type { MendServerSupabaseClient };
