import type {
  ConversationRecord,
  CodingRunEventRecord,
  CodingRunRecord,
  IssueRecord,
  KnowledgeArticleRecord,
  MessageRecord,
  Workspace,
} from "./workspace-data";
import type { Database } from "../lib/database.types";
import type {
  Conversation,
  CodingRun,
  AiDraft,
  AiDraftSource,
  AiMode,
  Issue,
  KnowledgeArticle,
  Message,
  Priority,
  IssueStatus,
  IssueType,
  AutomationState,
  AiDecision,
  HumanTakeoverReason,
} from "../types";

type Tables = Database["public"]["Tables"];
export type ContactRecord = Tables["contacts"]["Row"];
export type ChannelConnectionRecord = Tables["channel_connections"]["Row"];
export type AiDraftRecord = Tables["ai_drafts"]["Row"];
export type AiDraftKnowledgeRecord = Tables["ai_draft_knowledge"]["Row"];
export interface WorkspaceData {
  workspaces: Workspace[];
  workspace: Workspace | null;
  channels: ChannelConnectionRecord[];
  conversations: Conversation[];
  issues: Issue[];
  runs: CodingRun[];
  knowledge: KnowledgeArticle[];
}

const priorityMap: Record<string, Priority> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};
const statusMap: Record<string, IssueStatus> = {
  triage: "Triage",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  canceled: "Canceled",
};
const typeMap: Record<string, IssueType> = {
  production_bug: "Production Bug",
  bug: "Bug",
  incident: "Incident",
  feature: "Feature",
  task: "Task",
  billing: "Billing",
  commercial: "Commercial",
  question: "Question",
  other: "Other",
};
const runModeMap: Record<string, CodingRun["mode"]> = {
  investigate: "Investigate",
  propose_fix: "Propose fix",
  implement_fix: "Implement fix",
};
const runStatusMap: Record<string, CodingRun["status"]> = {
  queued: "Running",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
  approved: "Approved",
  rejected: "Rejected",
};
const accents = ["#7c91ff", "#e9a75d", "#8ecb9c", "#b997e8", "#6fb6c8"];

const fallback = <T>(
  value: string | null | undefined,
  table: Record<string, T>,
  defaultValue: T,
) => table[value ?? ""] ?? defaultValue;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "—"
  );
}

function accentFor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return accents[Math.abs(hash) % accents.length];
}

function displayTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toUiMessage(record: MessageRecord): Message {
  const messageType =
    record.message_type === "reaction"
      ? "text"
      : (record.message_type as Message["type"]);
  return {
    id: record.id,
    conversationId: record.conversation_id,
    providerMessageId: record.provider_message_id,
    direction: record.direction === "outbound" ? "outbound" : "inbound",
    sender:
      record.sender_type === "contact"
        ? "Customer"
        : record.sender_type === "ai"
          ? "Mend AI"
          : "Mend operator",
    text: record.text ?? record.caption ?? "",
    time: displayTime(record.created_at),
    type: messageType,
    status:
      record.provider_status === "read"
        ? "read"
        : record.provider_status === "delivered"
          ? "delivered"
          : record.provider_status === "failed"
            ? "failed"
            : record.direction === "outbound"
              ? "sent"
              : undefined,
    aiGenerated: record.ai_generated,
    mediaStatus:
      record.media_status === "processing" ||
      record.media_status === "failed" ||
      record.media_status === "unsupported"
        ? record.media_status
        : record.message_type === "text"
          ? undefined
          : "ready",
    mediaAssetId: record.media_asset_id ?? undefined,
    mediaBatchId: record.media_batch_id ?? undefined,
    attachment:
      record.file_name || record.media_remote_url || record.media_storage_path
        ? {
            name: record.file_name ?? "Attachment",
            meta: record.mime_type ?? "Attachment",
            url: record.media_remote_url ?? undefined,
            ...(record.file_size !== null && record.file_size !== undefined
              ? { sizeBytes: record.file_size }
              : {}),
            ...(record.duration_seconds !== null &&
            record.duration_seconds !== undefined
              ? { durationSeconds: record.duration_seconds }
              : {}),
          }
        : undefined,
    quotedMessageId: record.quoted_message_id ?? undefined,
    deleted: record.is_deleted,
  };
}

export function toUiConversation(
  record: ConversationRecord,
  contact: ContactRecord | undefined,
  records: MessageRecord[],
  issue?: IssueRecord,
  aiState?: Tables["conversation_ai_state"]["Row"],
  aiDraft?: AiDraft,
): Conversation {
  const name =
    contact?.display_name || contact?.phone_number || "Unknown contact";
  const messages = records
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(toUiMessage);
  const last = messages.at(-1);
  return {
    id: record.id,
    name,
    company: contact?.company_name ?? "",
    phone: contact?.phone_number ?? "Phone unavailable",
    initials: initials(name),
    accent: accentFor(record.id),
    status: record.status as Conversation["status"],
    attention: record.attention_state as Conversation["attention"],
    aiMode: record.ai_mode as Conversation["aiMode"],
    automationState: (aiState?.automation_state === "human_paused"
      ? "human_paused"
      : "ai_active") as AutomationState,
    ...(aiState?.human_takeover_at
      ? { humanTakeoverAt: aiState.human_takeover_at }
      : {}),
    ...(aiState?.human_takeover_by
      ? { humanTakeoverBy: aiState.human_takeover_by }
      : {}),
    ...(aiState?.human_takeover_reason
      ? {
          humanTakeoverReason:
            aiState.human_takeover_reason as HumanTakeoverReason,
        }
      : {}),
    ...(aiState?.last_decision
      ? { aiDecision: aiState.last_decision as AiDecision }
      : {}),
    ...(aiState?.last_decision_reason
      ? { aiDecisionReason: aiState.last_decision_reason }
      : {}),
    ...(aiState?.latest_intent ? { aiIntent: aiState.latest_intent } : {}),
    ...(aiState?.latest_confidence !== null &&
    aiState?.latest_confidence !== undefined
      ? { aiConfidence: aiState.latest_confidence }
      : {}),
    ...(aiState?.current_summary ? { aiSummary: aiState.current_summary } : {}),
    ...(aiDraft ? { aiDraft } : {}),
    unread: record.unread_count,
    lastMessage: last?.text || "No messages yet",
    lastTime: displayTime(record.last_message_at ?? last?.time),
    lastMessageAt: record.last_message_at ?? record.updated_at,
    issueId: issue?.id,
    issueLabel: issue?.identifier,
    priority: issue
      ? fallback(issue.priority, priorityMap, "No priority")
      : undefined,
    assignee: record.assigned_user_id ?? "Unassigned",
    messages,
  };
}

export function toUiAiDraft(
  record: AiDraftRecord,
  sources: AiDraftSource[] = [],
): AiDraft {
  return {
    id: record.id,
    body: record.body,
    mode: record.mode as AiMode,
    action: record.action as AiDraft["action"],
    status: record.status as AiDraft["status"],
    ...(record.safety_reason ? { safetyReason: record.safety_reason } : {}),
    updatedAt: record.updated_at,
    sources,
  };
}

export function toUiIssue(
  record: IssueRecord,
  customer?: string,
  related: { labels?: string[]; codexRuns?: number } = {},
): Issue {
  return {
    id: record.id,
    identifier: record.identifier,
    title: record.title,
    type: fallback(record.type, typeMap, "Other"),
    priority: fallback(record.priority, priorityMap, "No priority"),
    status: fallback(record.status, statusMap, "Triage"),
    assignee: record.assigned_user_id ?? "Unassigned",
    labels: related.labels ?? [],
    customer,
    conversationId: record.conversation_id ?? undefined,
    source: record.source === "internal" ? "Internal" : "Conversation",
    summary: record.ai_summary ?? record.description ?? record.title,
    impact: record.impact ?? "Impact to be assessed during triage.",
    updatedAt: displayTime(record.updated_at),
    createdAt: displayTime(record.created_at),
    codexRuns: related.codexRuns ?? 0,
  };
}

export function toUiRun(
  record: CodingRunRecord,
  events: CodingRunEventRecord[] = [],
  issueIdentifier?: string,
): CodingRun {
  const result =
    record.result_json &&
    typeof record.result_json === "object" &&
    !Array.isArray(record.result_json)
      ? (record.result_json as Record<string, unknown>)
      : {};
  const agent =
    result.agent &&
    typeof result.agent === "object" &&
    !Array.isArray(result.agent)
      ? (result.agent as Record<string, unknown>)
      : {};
  const fileNames = Array.isArray(result.files)
    ? result.files
        .map((file) =>
          typeof file === "string"
            ? file
            : file && typeof file === "object" && "relativePath" in file
              ? String(file.relativePath)
              : "",
        )
        .filter(Boolean)
    : [];
  const checks = Array.isArray(result.checks)
    ? result.checks
        .filter(
          (check): check is Record<string, unknown> =>
            Boolean(check) &&
            typeof check === "object" &&
            !Array.isArray(check),
        )
        .map((check) => ({
          name: String(check.name ?? "check"),
          exitCode: Number(check.exitCode ?? 1),
          output: String(check.output ?? ""),
        }))
    : [];
  const started = Date.parse(record.started_at ?? record.created_at);
  const finished = record.finished_at ? Date.parse(record.finished_at) : NaN;
  const durationSeconds =
    Number.isFinite(started) && Number.isFinite(finished)
      ? Math.max(0, Math.round((finished - started) / 1000))
      : null;
  return {
    id: record.id,
    issueId: record.issue_id,
    issueIdentifier: String(
      issueIdentifier ??
        result.issueIdentifier ??
        record.issue_id.slice(0, 8).toUpperCase(),
    ),
    mode: fallback(record.mode, runModeMap, "Investigate"),
    status: fallback(record.status, runStatusMap, "Running"),
    progress: record.progress,
    startedAt: displayTime(record.started_at ?? record.created_at),
    duration:
      durationSeconds === null
        ? "—"
        : `${Math.floor(durationSeconds / 60)
            .toString()
            .padStart(2, "0")}:${(durationSeconds % 60)
            .toString()
            .padStart(2, "0")}`,
    summary:
      typeof agent.finalText === "string"
        ? agent.finalText
        : typeof result.summary === "string"
          ? result.summary
          : "Persisted Codex run",
    branch: record.branch_name ?? undefined,
    commit: record.commit_sha ?? undefined,
    files: fileNames,
    diff: typeof result.patch === "string" ? result.patch : undefined,
    diffTruncated: result.diffTruncated === true,
    checks,
    events: events
      .filter((event) => event.coding_run_id === record.id)
      .map((event) => ({
        id: event.id,
        label: event.event_type,
        detail: event.message,
        time: displayTime(event.created_at),
        tone: event.event_type.includes("fail")
          ? "danger"
          : event.event_type.includes("complete")
            ? "success"
            : "accent",
      })),
  };
}

export function toUiKnowledge(
  record: KnowledgeArticleRecord,
): KnowledgeArticle {
  const apiRecord = record as KnowledgeArticleRecord & {
    updatedAt?: string | null;
  };
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    updatedAt: displayTime(record.updated_at ?? apiRecord.updatedAt ?? null),
    excerpt: record.body,
    status: record.status === "published" ? "Published" : "Draft",
  };
}

export function toWorkspaceLabel(workspace: Workspace) {
  return { id: workspace.id, name: workspace.name, slug: workspace.slug };
}
