import type { CodexRunRecord } from "../codex.js";
import type { RepositoryConfig } from "../codex-service.js";
import type { IssueCreateInput, IssuePatchInput } from "../issue-service.js";
import type {
  RepositoryInput,
  RepositoryPatchInput,
} from "../contracts/api-ports.js";
import { normalizeLocale } from "../locale.js";

export type Row = Record<string, unknown>;
export type DbResult = { data: unknown; error: { message?: string } | null };

export function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row) : [];
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function nullable(value: unknown): string | null {
  return value == null ? null : String(value);
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function rpcRow(value: unknown): Row {
  const result = row(Array.isArray(value) ? value[0] : value);
  if (!Object.keys(result).length) throw new Error("supabase_empty_result");
  return result;
}

export function checked(scope: string, result: DbResult): unknown {
  if (result.error)
    throw new Error(
      `supabase:${scope}:${result.error.message ?? "unknown_error"}`,
    );
  return result.data;
}

export function workspace(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    name: str(rowValue.name),
    slug: str(rowValue.slug),
    issuePrefix: str(rowValue.issue_prefix, "MEND"),
    timezone: str(rowValue.timezone, "UTC"),
    defaultLanguage: normalizeLocale(rowValue.default_language),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

export function workspaceMember(rowValue: Row): Row {
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    userId: str(rowValue.user_id),
    role: str(rowValue.role, "viewer"),
    createdAt: nullable(rowValue.created_at),
  };
}

export function workspaceMemberWithEmail(rowValue: Row): Row {
  return {
    ...workspaceMember(rowValue),
    displayName: nullable(rowValue.display_name),
    email: nullable(rowValue.email),
  };
}

export function workspaceInvitation(rowValue: Row): Row {
  const expiresAt = nullable(rowValue.expires_at);
  const deliveryStatus = str(rowValue.delivery_status, "pending");
  const status =
    deliveryStatus === "sent" &&
    expiresAt &&
    Date.parse(expiresAt) <= Date.now()
      ? "expired"
      : deliveryStatus === "sent"
        ? "pending"
        : deliveryStatus;
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    email: str(rowValue.email),
    role: str(rowValue.role, "agent"),
    invitedBy: str(rowValue.invited_by),
    status,
    deliveryKind: nullable(rowValue.delivery_kind),
    sentAt: nullable(rowValue.sent_at),
    expiresAt,
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

export function auditLog(rowValue: Row): Row {
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

export function channel(rowValue: Row): Row {
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
    historySyncProgress: num(rowValue.history_sync_progress, 100),
    historySyncComplete: rowValue.history_sync_complete !== false,
    historySyncUpdatedAt: nullable(rowValue.history_sync_updated_at),
    createdAt: nullable(rowValue.created_at),
    updatedAt: nullable(rowValue.updated_at),
  };
}

export function message(rowValue: Row): Row {
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
    quotedMessageId: nullable(rowValue.quoted_message_id),
    providerStatus: nullable(rowValue.provider_status),
    isDeleted: rowValue.is_deleted === true,
    aiGenerated: rowValue.ai_generated === true,
    sentByUserId: nullable(rowValue.sent_by_user_id),
    providerTimestamp: nullable(rowValue.provider_timestamp),
    createdAt: nullable(rowValue.created_at),
  };
}

export function conversation(rowValue: Row): Row {
  const contact = row(rowValue.contact);
  const linkedChannel = row(rowValue.channel);
  const aiState = row(rowValue.ai_state);
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    channelConnectionId: str(rowValue.channel_connection_id),
    contactId: str(rowValue.contact_id),
    status: str(rowValue.status, "open"),
    attentionState: str(rowValue.attention_state, "needs_attention"),
    assignedUserId: nullable(rowValue.assigned_user_id),
    aiMode: str(rowValue.ai_mode, "draft"),
    automationState: str(aiState.automation_state, "ai_active"),
    humanTakeoverAt: nullable(aiState.human_takeover_at),
    humanTakeoverBy: nullable(aiState.human_takeover_by),
    humanTakeoverReason: nullable(aiState.human_takeover_reason),
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

export function issue(rowValue: Row): Row {
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
    dueOn: nullable(rowValue.due_on),
    kanbanPosition: num(rowValue.kanban_position),
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

export function article(rowValue: Row): Row {
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

export function repository(
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

export function run(rowValue: Row): CodexRunRecord {
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

export function providerStatus(
  value: unknown,
): "open" | "closed" | "connecting" | "qr-code" {
  const state = String(value ?? "").toLowerCase();
  if (state === "open" || state === "connected") return "open";
  if (state === "qr" || state === "qrcode" || state === "qr-code")
    return "qr-code";
  if (state === "connecting" || state === "pending") return "connecting";
  return "closed";
}

export function issueDbPayload(value: IssueCreateInput | IssuePatchInput): Row {
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
    ...(input.dueOn !== undefined ? { due_on: input.dueOn } : {}),
    ...(input.parentIssueId !== undefined
      ? { parent_issue_id: input.parentIssueId }
      : {}),
    ...(input.duplicateOfIssueId !== undefined
      ? { duplicate_of_issue_id: input.duplicateOfIssueId }
      : {}),
  };
}

export function repositoryDbPayload(
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
