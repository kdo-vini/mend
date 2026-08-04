import type { Request } from "express";
import type { IssuePort } from "../issue-service.js";
import type { KnowledgePort } from "../knowledge-service.js";

export type WorkspaceRole = "owner" | "admin" | "agent" | "viewer";

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
}

export interface AiDraftInput {
  instruction?: string;
}

export interface ConversationPort {
  list(context: RequestContext, query: ConversationListQuery): Promise<unknown>;
  get(context: RequestContext, conversationId: string): Promise<unknown | null>;
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

export interface RepositoryListQuery {
  limit: number;
  cursor?: string;
}

export interface RepositoryInput {
  name: string;
  localPath: string;
  defaultBranch: string;
  allowedCommands: string[];
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
  mode: "investigate" | "propose_fix" | "implement_fix";
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
  reject(context: RequestContext, runId: string): Promise<unknown | null>;
  patch(
    context: RequestContext,
    runId: string,
  ): Promise<{ patch: string; truncated?: boolean } | null>;
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
  codingRuns: CodingRunPort;
}
