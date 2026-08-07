import type {
  ConversationRecord,
  CodingRunEventRecord,
  CodingRunRecord,
  BugCaseEventRecord,
  BugCaseRecord,
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
  BugDecision,
  BugEvidence,
  BugLoopStage,
  BugVerdict,
  CodingAgentProvider,
} from "../types";
import { currentInterfaceLanguage } from "../i18n/preferences";

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
const stageOrder: BugLoopStage[] = [
  "signal",
  "suspicion",
  "evidence",
  "investigation",
  "verdict",
  "decision",
  "fix",
  "verification",
  "approval",
  "pull_request",
  "merge",
  "deploy",
  "health_check",
  "customer_response",
  "completed",
  "failed",
];
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(currentInterfaceLanguage(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toUiMessage(
  record: MessageRecord,
  contactDisplayName?: string,
): Message {
  const messageType =
    record.message_type === "reaction"
      ? "text"
      : (record.message_type as Message["type"]);
  return {
    id: record.id,
    conversationId: record.conversation_id,
    providerMessageId: record.provider_message_id,
    senderUserId: record.sent_by_user_id ?? undefined,
    direction: record.direction === "outbound" ? "outbound" : "inbound",
    sender:
      contactDisplayName ||
      record.participant_name ||
      (record.sender_type === "contact"
        ? "Customer"
        : record.sender_type === "ai"
          ? "Mend AI"
          : "Mend operator"),
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
  const chatType = contact?.provider_contact_id?.endsWith("@g.us")
    ? "group"
    : "direct";
  const orderedRecords = records.sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const messages = orderedRecords
    .filter((record) => record.message_type !== "reaction")
    .map((record) =>
      toUiMessage(record, chatType === "direct" ? name : undefined),
    );
  for (const reaction of orderedRecords.filter(
    (record) => record.message_type === "reaction",
  )) {
    const target = messages.find(
      (message) => message.id === reaction.quoted_message_id,
    );
    const emoji = reaction.text ?? reaction.caption;
    if (!target || !emoji) continue;
    const mappedReaction = {
      emoji,
      mine: reaction.direction === "outbound",
    };
    target.reactions = mappedReaction.mine
      ? [
          ...(target.reactions ?? []).filter((item) => !item.mine),
          mappedReaction,
        ]
      : [...(target.reactions ?? []), mappedReaction];
  }
  const last = messages.at(-1);
  return {
    id: record.id,
    contactId: record.contact_id,
    chatType,
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
  related: { labels?: string[]; agentRuns?: number } = {},
): Issue {
  return {
    id: record.id,
    identifier: record.identifier,
    title: record.title,
    type: fallback(record.type, typeMap, "Other"),
    priority: fallback(record.priority, priorityMap, "No priority"),
    status: fallback(record.status, statusMap, "Triage"),
    dueOn: record.due_on,
    kanbanPosition: record.kanban_position,
    assignee: record.assigned_user_id ?? "Unassigned",
    labels: related.labels ?? [],
    customer,
    conversationId: record.conversation_id ?? undefined,
    source: record.source === "internal" ? "Internal" : "Conversation",
    summary: record.ai_summary ?? record.description ?? record.title,
    impact: record.impact ?? "Impact to be assessed during triage.",
    updatedAt: displayTime(record.updated_at),
    createdAt: displayTime(record.created_at),
    agentRuns: related.agentRuns ?? 0,
  };
}

export function toUiRun(
  record: CodingRunRecord,
  events: CodingRunEventRecord[] = [],
  issueIdentifier?: string,
  persistedCase?: BugCaseRecord,
  caseEvents: BugCaseEventRecord[] = [],
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
  const agentReport = objectValue(agent.report);
  const embeddedCase = objectValue(result.bugCase ?? result.bug_case);
  const loop = persistedCase
    ? (persistedCase as unknown as Record<string, unknown>)
    : Object.keys(embeddedCase).length
      ? embeddedCase
      : result;
  const pullRequest = objectValue(
    loop.pullRequest ?? loop.pull_request ?? result.pullRequest,
  );
  const deployment = objectValue(loop.deployment ?? result.deployment);
  const providerValue = String(
    loop.provider ?? agent.provider ?? result.provider ?? "",
  ).toLowerCase();
  const provider = ["openai", "anthropic", "google", "verboo"].includes(
    providerValue,
  )
    ? (providerValue as CodingAgentProvider)
    : undefined;
  const evidence = mapBugEvidence(
    loop.evidence ?? loop.evidence_json ?? result.evidence,
  );
  const caseEvidence = persistedCase
    ? mergeBugEvidence(
        evidence,
        investigationEvidence(persistedCase.id, caseEvents),
      )
    : evidence;
  const stage = String(loop.stage ?? "") as BugLoopStage;
  const verdict = String(loop.verdict ?? "") as BugVerdict;
  const decision = String(loop.decision ?? "") as BugDecision;
  const suspicionScore = Number(
    loop.suspicionScore ?? loop.suspicion_score ?? Number.NaN,
  );
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
      typeof agentReport.summary === "string"
        ? agentReport.summary
        : typeof agent.finalText === "string"
          ? agent.finalText
          : typeof result.summary === "string"
            ? result.summary
            : "Persisted engineering run",
    branch: record.branch_name ?? undefined,
    commit: record.commit_sha ?? undefined,
    published: Boolean(
      result.publication &&
        typeof result.publication === "object" &&
        !Array.isArray(result.publication) &&
        (result.publication as Record<string, unknown>).status === "published",
    ),
    deployed: Boolean(
      result.deployment &&
        typeof result.deployment === "object" &&
        !Array.isArray(result.deployment) &&
        (result.deployment as Record<string, unknown>).status === "deployed",
    ),
    files: fileNames,
    diff: typeof result.patch === "string" ? result.patch : undefined,
    diffTruncated: result.diffTruncated === true,
    checks,
    caseId:
      typeof loop.id === "string"
        ? loop.id
        : typeof loop.caseId === "string"
          ? loop.caseId
          : undefined,
    caseStatus:
      loop.status === "active" ||
      loop.status === "awaiting_human" ||
      loop.status === "completed" ||
      loop.status === "failed" ||
      loop.status === "canceled"
        ? loop.status
        : undefined,
    stage: stage || undefined,
    provider,
    providerVersion:
      typeof loop.version === "string"
        ? loop.version
        : typeof agent.version === "string"
          ? agent.version
          : undefined,
    suspicionScore: Number.isFinite(suspicionScore)
      ? suspicionScore
      : undefined,
    verdict: verdict || undefined,
    decision: decision || undefined,
    evidence: caseEvidence,
    pullRequest:
      Number.isFinite(Number(pullRequest.number ?? loop.pr_number)) &&
      typeof (pullRequest.url ?? loop.pr_url) === "string"
        ? {
            number: Number(pullRequest.number ?? loop.pr_number),
            url: String(pullRequest.url ?? loop.pr_url),
            ...(typeof pullRequest.head === "string"
              ? { head: pullRequest.head }
              : {}),
            ...(typeof pullRequest.base === "string"
              ? { base: pullRequest.base }
              : {}),
            ...(typeof pullRequest.draft === "boolean"
              ? { draft: pullRequest.draft }
              : {}),
          }
        : undefined,
    mergeSha:
      typeof loop.mergeSha === "string"
        ? loop.mergeSha
        : typeof loop.merge_sha === "string"
          ? loop.merge_sha
          : undefined,
    deploymentUrl:
      typeof loop.deploymentUrl === "string"
        ? loop.deploymentUrl
        : typeof loop.deployment_url === "string"
          ? loop.deployment_url
          : typeof deployment.url === "string"
            ? deployment.url
            : undefined,
    healthStatus:
      typeof loop.healthStatus === "string"
        ? loop.healthStatus
        : typeof loop.health_status === "string"
          ? loop.health_status
          : undefined,
    customerResponseStatus:
      typeof loop.customerResponseStatus === "string"
        ? loop.customerResponseStatus
        : typeof loop.customer_response_status === "string"
          ? loop.customer_response_status
          : undefined,
    events: [
      ...caseEvents
        .filter((event) => event.bug_case_id === persistedCase?.id)
        .map(toUiBugCaseEvent),
      ...events
        .filter((event) => event.agent_run_id === record.id)
        .map((event) => ({
          id: event.id,
          label: event.event_type,
          detail: event.message,
          time: displayTime(event.created_at),
          tone: event.event_type.includes("fail")
            ? ("danger" as const)
            : event.event_type.includes("complete")
              ? ("success" as const)
              : ("accent" as const),
        })),
    ],
  };
}

function mapBugEvidence(value: unknown): BugEvidence[] {
  return Array.isArray(value)
    ? value
        .map((item): BugEvidence | null => {
          const record = objectValue(item);
          const kind = String(record.kind ?? "evidence");
          const label = String(
            record.label ?? record.title ?? kind.replaceAll("_", " "),
          ).trim();
          if (!label) return null;
          const detail = String(
            record.detail ??
              record.value ??
              record.summary ??
              record.customerMessage ??
              "",
          ).trim();
          return {
            kind,
            label,
            ...(detail ? { detail } : {}),
          };
        })
        .filter((item): item is BugEvidence => Boolean(item))
    : [];
}

function investigationEvidence(
  caseId: string,
  events: BugCaseEventRecord[],
): BugEvidence[] {
  return events
    .filter(
      (event) =>
        event.bug_case_id === caseId &&
        event.event_type === "investigation.completed",
    )
    .flatMap((event) =>
      mapBugEvidence(objectValue(event.metadata_json).evidence),
    );
}

function mergeBugEvidence(
  first: BugEvidence[],
  second: BugEvidence[],
): BugEvidence[] {
  const output = [...first];
  const keys = new Set(output.map((item) => `${item.kind}:${item.label}`));
  for (const item of second) {
    const key = `${item.kind}:${item.label}`;
    if (keys.has(key)) continue;
    keys.add(key);
    output.push(item);
  }
  return output;
}

function toUiBugCaseEvent(event: BugCaseEventRecord) {
  return {
    id: event.id,
    label: event.event_type,
    detail: event.message,
    time: displayTime(event.created_at),
    tone: event.event_type.includes("fail")
      ? ("danger" as const)
      : event.stage === "completed" || event.event_type.includes("complete")
        ? ("success" as const)
        : event.stage === "decision" || event.stage === "approval"
          ? ("warning" as const)
          : ("accent" as const),
  };
}

export function toUiBugCase(
  record: BugCaseRecord,
  events: BugCaseEventRecord[] = [],
  issueIdentifier?: string,
): CodingRun {
  const stage = record.stage as BugLoopStage;
  const stageIndex = Math.max(0, stageOrder.indexOf(stage));
  const status: CodingRun["status"] =
    record.status === "completed"
      ? "Completed"
      : record.status === "failed"
        ? "Failed"
        : record.status === "canceled"
          ? "Canceled"
          : "Running";
  const latestEvent = events
    .filter((event) => event.bug_case_id === record.id)
    .at(-1);
  const investigationEvent = events
    .filter(
      (event) =>
        event.bug_case_id === record.id &&
        event.event_type === "investigation.completed",
    )
    .at(-1);
  const investigationMetadata = investigationEvent
    ? objectValue(investigationEvent.metadata_json)
    : {};
  return {
    id: `case:${record.id}`,
    issueId: record.issue_id,
    issueIdentifier:
      issueIdentifier ?? record.issue_id.slice(0, 8).toUpperCase(),
    mode:
      stageIndex < stageOrder.indexOf("fix") ? "Investigate" : "Implement fix",
    status,
    progress: Math.min(
      100,
      Math.round((stageIndex / (stageOrder.length - 1)) * 100),
    ),
    startedAt: displayTime(record.started_at),
    duration: "-",
    summary:
      (typeof investigationMetadata.summary === "string"
        ? investigationMetadata.summary
        : undefined) ??
      latestEvent?.message ??
      `Bug case is at ${record.stage}`,
    files: [],
    checks: [],
    caseId: record.id,
    caseStatus: record.status as CodingRun["caseStatus"],
    stage,
    suspicionScore: record.suspicion_score ?? undefined,
    verdict: record.verdict as BugVerdict,
    decision: record.decision as BugDecision,
    evidence: mergeBugEvidence(
      mapBugEvidence(record.evidence_json),
      investigationEvidence(record.id, events),
    ),
    pullRequest:
      record.pr_number && record.pr_url
        ? { number: record.pr_number, url: record.pr_url }
        : undefined,
    mergeSha: record.merge_sha ?? undefined,
    deploymentUrl: record.deployment_url ?? undefined,
    healthStatus: record.health_status,
    customerResponseStatus: record.customer_response_status,
    caseOnly: true,
    events: events
      .filter((event) => event.bug_case_id === record.id)
      .map(toUiBugCaseEvent),
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
