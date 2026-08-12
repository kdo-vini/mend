import type { Request } from "express";
import type { IssuePort } from "../issue-service.js";
import type { KnowledgePort } from "../knowledge-service.js";
import type { MediaAssetInput, MediaAssetRecord } from "../media-pipeline.js";
import type {
  KanbanIssuePort,
  PersonalPlanningPort,
} from "../kanban-service.js";
import type { GoogleConnectionPort } from "../google-calendar.js";
import type { McpConnectionPort } from "../mcp.js";
import type {
  AgentConnection,
  AuthMethod,
  CatalogSnapshot,
  CodingProvider,
  CodingStage,
  EffectiveRunConfig,
  StageRoutingPolicy,
  StageRoutingPolicyOverride,
} from "../coding-control-plane.js";

export type WorkspaceRole = "owner" | "admin" | "agent" | "viewer";
export type WorkspaceInvitationRole = Exclude<WorkspaceRole, "owner">;

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface AuthAdapter {
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
}

export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface MembershipAdapter {
  getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
}

export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface WorkspaceCreateInput {
  name: string;
  slug: string;
  issuePrefix: string;
  timezone: string;
  defaultLanguage: string;
}

export type WorkspacePatchInput = Partial<WorkspaceCreateInput>;

export interface WorkspaceMemberListQuery {
  role?: WorkspaceRole;
  limit: number;
  cursor?: string;
}

export interface WorkspaceMemberCreateInput {
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceMemberRolePatchInput {
  role: WorkspaceRole;
}

export interface WorkspaceInvitationCreateInput {
  email: string;
  role: WorkspaceInvitationRole;
}

export interface WorkspaceInvitationRolePatchInput {
  role: WorkspaceInvitationRole;
}

export interface AuditLogListQuery {
  action?: string;
  entityType?: string;
  limit: number;
  cursor?: string;
}

export interface WorkspacePort {
  list(userId: string): Promise<unknown>;
  create(userId: string, input: WorkspaceCreateInput): Promise<unknown>;
  get(context: RequestContext, workspaceId: string): Promise<unknown | null>;
  update(
    context: RequestContext,
    workspaceId: string,
    input: WorkspacePatchInput,
  ): Promise<unknown | null>;
  listMembers(
    context: RequestContext,
    query: WorkspaceMemberListQuery,
  ): Promise<unknown>;
  addMember(
    context: RequestContext,
    input: WorkspaceMemberCreateInput,
  ): Promise<unknown>;
  updateMemberRole(
    context: RequestContext,
    userId: string,
    input: WorkspaceMemberRolePatchInput,
  ): Promise<unknown | null>;
  removeMember(context: RequestContext, userId: string): Promise<boolean>;
  listInvitations(context: RequestContext): Promise<unknown>;
  createInvitation(
    context: RequestContext,
    input: WorkspaceInvitationCreateInput,
  ): Promise<unknown>;
  updateInvitationRole(
    context: RequestContext,
    invitationId: string,
    input: WorkspaceInvitationRolePatchInput,
  ): Promise<unknown>;
  removeInvitation(
    context: RequestContext,
    invitationId: string,
  ): Promise<boolean>;
  resendInvitation(
    context: RequestContext,
    invitationId: string,
  ): Promise<unknown>;
  listAuditLog(
    context: RequestContext,
    query: AuditLogListQuery,
  ): Promise<unknown>;
}

export interface ChannelListQuery {
  status?: "open" | "closed" | "connecting" | "qr-code";
  limit: number;
  cursor?: string;
}

export interface ChannelCreateInput {
  name: string;
  providerInstanceName: string;
  phoneNumber?: string;
  profileName?: string;
}

export interface ChannelPort {
  list(context: RequestContext, query: ChannelListQuery): Promise<unknown>;
  createWhatsmiau(
    context: RequestContext,
    input: ChannelCreateInput,
  ): Promise<unknown>;
  get(context: RequestContext, channelId: string): Promise<unknown | null>;
  connect(context: RequestContext, channelId: string): Promise<unknown | null>;
  qr(
    context: RequestContext,
    channelId: string,
  ): Promise<{ data: string; mimeType?: string } | null>;
  disconnect(
    context: RequestContext,
    channelId: string,
  ): Promise<unknown | null>;
  refresh(context: RequestContext, channelId: string): Promise<unknown | null>;
  getSettings(
    context: RequestContext,
    channelId: string,
  ): Promise<unknown | null>;
  updateSettings(
    context: RequestContext,
    channelId: string,
    settings: Record<string, unknown>,
  ): Promise<unknown | null>;
}

export interface ConversationListQuery {
  status?: "open" | "snoozed" | "resolved";
  attentionState?:
    | "needs_attention"
    | "ai_handling"
    | "waiting_customer"
    | "none";
  aiMode?: "off" | "draft" | "safe_auto";
  assignedUserId?: string;
  limit: number;
  cursor?: string;
}

export interface ConversationPatchInput {
  status?: "open" | "snoozed" | "resolved";
  attentionState?:
    | "needs_attention"
    | "ai_handling"
    | "waiting_customer"
    | "none";
  aiMode?: "off" | "draft" | "safe_auto";
  assignedUserId?: string | null;
  snoozedUntil?: string | null;
}

export interface ConversationSnoozeInput {
  until: string;
}

export interface SendMessageInput {
  messageType: "text" | "image" | "video" | "audio" | "document";
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mediaDataUrl?: string;
  fileName?: string;
  mimeType?: string;
  idempotencyKey?: string;
  mediaBatchId?: string;
  assetId?: string;
  attachments?: Array<{
    assetId: string;
    messageType: "image" | "video" | "audio" | "document";
    caption?: string;
    idempotencyKey: string;
  }>;
}

export interface AiDraftInput {
  instruction?: string;
}

export interface ConversationPort {
  list(context: RequestContext, query: ConversationListQuery): Promise<unknown>;
  get(context: RequestContext, conversationId: string): Promise<unknown | null>;
  delete(context: RequestContext, conversationId: string): Promise<boolean>;
  deleteMessage(
    context: RequestContext,
    conversationId: string,
    messageId: string,
  ): Promise<unknown | null>;
  reactToMessage(
    context: RequestContext,
    conversationId: string,
    messageId: string,
    reaction: string,
  ): Promise<unknown | null>;
  sendPresence(
    context: RequestContext,
    conversationId: string,
    presence: "composing" | "recording" | "paused",
  ): Promise<void>;
  update(
    context: RequestContext,
    conversationId: string,
    input: ConversationPatchInput,
  ): Promise<unknown | null>;
  markRead(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  snooze(
    context: RequestContext,
    conversationId: string,
    input: ConversationSnoozeInput,
  ): Promise<unknown | null>;
  resolve(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  pauseAi(
    context: RequestContext,
    conversationId: string,
    reason: string,
  ): Promise<unknown | null>;
  resumeAi(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  sendMessage(
    context: RequestContext,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<unknown | null>;
  aiDraft(
    context: RequestContext,
    conversationId: string,
    input: AiDraftInput,
  ): Promise<unknown | null>;
}

export interface MediaPort {
  createUpload(
    context: RequestContext,
    input: MediaAssetInput,
  ): Promise<unknown>;
  complete(
    context: RequestContext,
    assetId: string,
  ): Promise<MediaAssetRecord | null>;
  findAsset(
    context: RequestContext,
    assetId: string,
  ): Promise<MediaAssetRecord | null>;
  listAssets(
    context: RequestContext,
    assetIds: string[],
  ): Promise<MediaAssetRecord[]>;
  signedUrl(
    context: RequestContext,
    assetId: string,
    purpose?: "original" | "browser" | "provider" | "preview",
  ): Promise<{ url: string; mimeType?: string }>;
}

export interface RepositoryListQuery {
  limit: number;
  cursor?: string;
}

export interface RepositoryInput {
  name: string;
  defaultBranch: string;
  allowedCommands: string[];
  agentProvider: AgentProvider;
  executionPlane: AgentExecutionPlane;
  githubOwner?: string;
  githubRepo?: string;
  githubInstallationId?: string;
}

export type RepositoryPatchInput = Partial<RepositoryInput>;

export interface RepositoryPort {
  list(context: RequestContext, query: RepositoryListQuery): Promise<unknown>;
  create(context: RequestContext, input: RepositoryInput): Promise<unknown>;
  update(
    context: RequestContext,
    repositoryId: string,
    input: RepositoryPatchInput,
  ): Promise<unknown | null>;
  remove(context: RequestContext, repositoryId: string): Promise<boolean>;
}

export type AgentProvider = "openai" | "anthropic" | "google" | "verboo";
export type AgentExecutionPlane = "dokploy" | "github_actions";
export type AgentCredentialTask = "support" | "agent";

export interface AgentCredentialRecord {
  task: AgentCredentialTask;
  provider: AgentProvider;
  configured: boolean;
  updatedAt: string;
}

export interface AgentCredentialPort {
  list(context: RequestContext): Promise<AgentCredentialRecord[]>;
  save(
    context: RequestContext,
    input: {
      task: AgentCredentialTask;
      provider: AgentProvider;
      apiKey: string;
      config?: Record<string, unknown>;
    },
  ): Promise<AgentCredentialRecord>;
  remove(
    context: RequestContext,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<boolean>;
  resolve(
    workspaceId: string,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<{ apiKey: string; config: Record<string, unknown> } | null>;
}

export interface AgentConnectionCreateInput {
  label: string;
  provider: CodingProvider;
  authMethod: AuthMethod;
  purpose?: "coding" | "support";
  apiKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentConnectionPatchInput {
  label?: string;
  automationConsent?: boolean;
}

export interface AgentLoginStartInput {
  provider: Exclude<CodingProvider, "anthropic" | "verboo">;
  label: string;
}

export interface AgentLoginJob {
  id: string;
  connectionId?: string;
  provider: CodingProvider;
  status:
    | "pending"
    | "awaiting_user"
    | "completed"
    | "failed"
    | "canceled"
    | "expired";
  url?: string;
  code?: string;
  expiresAt: string;
  errorCode?: string;
}

export interface AgentRoutingPolicyInput {
  repositoryId?: string;
  stage: CodingStage;
  connectionId?: string;
  model?: string;
  effort?: string;
  budget?: Record<string, unknown>;
  fallbackEnabled?: boolean;
  fallbackConnectionIds?: string[];
  preset?: "Economy" | "Balanced" | "Quality" | "Custom";
}

export interface CodingControlPlanePort {
  resolveConnectionSecret(
    workspaceId: string,
    connectionId: string,
  ): Promise<{ apiKey?: string; bundle?: Record<string, string> } | null>;
  listConnections(context: RequestContext): Promise<AgentConnection[]>;
  createConnection(
    context: RequestContext,
    input: AgentConnectionCreateInput,
  ): Promise<AgentConnection>;
  updateConnection(
    context: RequestContext,
    connectionId: string,
    input: AgentConnectionPatchInput,
  ): Promise<AgentConnection | null>;
  removeConnection(
    context: RequestContext,
    connectionId: string,
  ): Promise<boolean>;
  verifyConnection(
    context: RequestContext,
    connectionId: string,
  ): Promise<AgentConnection | null>;
  listModels(
    context: RequestContext,
    connectionId: string,
    refresh?: boolean,
  ): Promise<CatalogSnapshot | null>;
  startLogin(
    context: RequestContext,
    input: AgentLoginStartInput,
  ): Promise<AgentLoginJob>;
  listLoginJobs(context: RequestContext): Promise<AgentLoginJob[]>;
  pollLogin(
    context: RequestContext,
    jobId: string,
  ): Promise<AgentLoginJob | null>;
  cancelLogin(
    context: RequestContext,
    jobId: string,
  ): Promise<AgentLoginJob | null>;
  getPolicies(
    context: RequestContext,
    repositoryId?: string,
  ): Promise<StageRoutingPolicy[]>;
  putPolicy(
    context: RequestContext,
    input: AgentRoutingPolicyInput,
  ): Promise<StageRoutingPolicy>;
  resolveRunConfig(input: {
    context: RequestContext;
    stage: CodingStage;
    repositoryId?: string;
    override?: StageRoutingPolicyOverride;
    automation: boolean;
  }): Promise<EffectiveRunConfig>;
}

export interface CodingRunListQuery {
  issueId?: string;
  status?:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "canceled"
    | "approved"
    | "rejected";
  limit: number;
  cursor?: string;
}

export interface CodingRunCreateInput {
  repositoryId?: string;
  mode?: "investigate" | "propose_fix" | "implement_fix";
  stage?: CodingStage;
  parentRunId?: string;
  researchArtifactId?: string;
  routeOverride?: StageRoutingPolicyOverride;
  branchBase: string;
  instructions?: string;
  allowChanges: boolean;
  commands: string[];
}

export interface CodingRunPort {
  list(context: RequestContext, query: CodingRunListQuery): Promise<unknown>;
  create(
    context: RequestContext,
    issueIdentifier: string,
    input: CodingRunCreateInput,
  ): Promise<unknown>;
  get(context: RequestContext, runId: string): Promise<unknown | null>;
  cancel(context: RequestContext, runId: string): Promise<unknown | null>;
  approve(context: RequestContext, runId: string): Promise<unknown | null>;
  publish(context: RequestContext, runId: string): Promise<unknown | null>;
  merge(context: RequestContext, runId: string): Promise<unknown | null>;
  deploy(context: RequestContext, runId: string): Promise<unknown | null>;
  health(context: RequestContext, runId: string): Promise<unknown | null>;
  reject(context: RequestContext, runId: string): Promise<unknown | null>;
  patch(
    context: RequestContext,
    runId: string,
  ): Promise<{ patch: string; truncated?: boolean } | null>;
}

export interface GitHubConnectionPort {
  startSetup(
    context: RequestContext,
    repositoryId: string,
  ): Promise<{ installationUrl: string }>;
  startWorkspaceSetup(
    context: RequestContext,
  ): Promise<{ installationUrl: string }>;
  getWorkspaceConnection(context: RequestContext): Promise<unknown>;
  listWorkspaceRepositories(context: RequestContext): Promise<unknown>;
  disconnectWorkspace(context: RequestContext): Promise<boolean>;
  completeSetup(query: Record<string, unknown>): Promise<unknown>;
}

export interface ImpactPort {
  summary(
    context: RequestContext,
    period: { from: string; to: string },
  ): Promise<unknown>;
}

export interface ApiRouterDependencies {
  auth: AuthAdapter;
  membership: MembershipAdapter;
  workspaces: WorkspacePort;
  channels: ChannelPort;
  conversations: ConversationPort;
  issues: IssuePort;
  knowledge: KnowledgePort;
  repositories: RepositoryPort;
  agentCredentials: AgentCredentialPort;
  codingControlPlane?: CodingControlPlanePort;
  githubConnections: GitHubConnectionPort;
  codingRuns: CodingRunPort;
  googleConnections: GoogleConnectionPort;
  mcpConnections: McpConnectionPort;
  media?: MediaPort;
  kanban: KanbanIssuePort;
  personalPlanning: PersonalPlanningPort;
  impact: ImpactPort;
}
