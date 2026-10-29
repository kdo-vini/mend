export type ConversationStatus = "open" | "snoozed" | "resolved";
export type AttentionState =
  | "needs_attention"
  | "ai_handling"
  | "waiting_customer"
  | "none";
export type AiMode = "off" | "draft" | "safe_auto";
export type AutomationState = "ai_active" | "human_paused";
export type AiDecision = "draft" | "auto_reply" | "blocked" | "human_paused";
export type HumanTakeoverReason =
  | "human_message"
  | "customer_requested_human"
  | "unsafe_intent"
  | "low_confidence"
  | "manual_pause";
export type IssueStatus =
  | "Triage"
  | "Backlog"
  | "Todo"
  | "In Progress"
  | "Review"
  | "Done"
  | "Canceled";
export type Priority = "Urgent" | "High" | "Medium" | "Low" | "No priority";
export type IssueType =
  | "Production Bug"
  | "Bug"
  | "Incident"
  | "Feature"
  | "Task"
  | "Billing"
  | "Commercial"
  | "Question"
  | "Other";

export type MessageType = "text" | "image" | "video" | "audio" | "document";

export interface Message {
  id: string;
  conversationId: string;
  providerMessageId?: string;
  clientId?: string;
  senderUserId?: string;
  direction: "inbound" | "outbound";
  sender: string;
  text: string;
  time: string;
  createdAt?: string;
  type: MessageType;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  /** Client-only upload percentage while an outbound attachment is sending. */
  uploadProgress?: number;
  aiGenerated?: boolean;
  mediaStatus?: "processing" | "ready" | "failed" | "unsupported";
  transcriptionStatus?: "processing" | "ready" | "failed";
  transcriptionErrorCode?: string;
  mediaAssetId?: string;
  mediaBatchId?: string;
  mediaStoragePath?: string;
  attachment?: {
    name: string;
    meta: string;
    url?: string;
    previewUrl?: string;
    sizeBytes?: number;
    durationSeconds?: number;
    width?: number;
    height?: number;
  };
  quotedMessageId?: string;
  deleted?: boolean;
  /** Set when the provider reported an edit of this message. */
  editedAt?: string;
  reactions?: Array<{ emoji: string; mine: boolean; pending?: boolean }>;
  pendingReaction?: string;
}

export interface AiDraftSource {
  id: string;
  title: string;
  category: string;
}

export interface AiDraft {
  id: string;
  body: string;
  mode: AiMode;
  action: "draft" | "auto_reply" | "blocked";
  status: "pending_review" | "auto_eligible" | "sent" | "rejected" | "expired";
  safetyReason?: string;
  updatedAt: string;
  sources: AiDraftSource[];
}

export interface Conversation {
  id: string;
  contactId?: string;
  chatType: "direct" | "group";
  name: string;
  company: string;
  phone: string;
  initials: string;
  /** WhatsApp photo, only from the Whatsmiau bucket; initials otherwise. */
  photoUrl?: string;
  accent: string;
  status: ConversationStatus;
  attention: AttentionState;
  aiMode: AiMode;
  automationState: AutomationState;
  humanTakeoverAt?: string;
  humanTakeoverBy?: string;
  humanTakeoverReason?: HumanTakeoverReason;
  aiDecision?: AiDecision;
  aiDecisionReason?: string;
  aiIntent?: string;
  aiConfidence?: number;
  aiSummary?: string;
  aiDraft?: AiDraft;
  unread: number;
  lastMessage: string;
  lastTime: string;
  lastMessageAt: string;
  issueId?: string;
  issueLabel?: string;
  priority?: Priority;
  assignee: string;
  messages: Message[];
  /** Set once a full thread snapshot (not the list preview) has been merged. */
  threadLoaded?: boolean;
  /** Request order of the snapshot last applied; guards stale races. */
  snapshotSeq?: number;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  type: IssueType;
  priority: Priority;
  status: IssueStatus;
  completedAt?: string | null;
  dueOn?: string | null;
  kanbanPosition?: number;
  assignee: string;
  labels: string[];
  customer?: string;
  conversationId?: string;
  source: "Conversation" | "Internal";
  summary: string;
  impact: string;
  updatedAt: string;
  createdAt: string;
  agentRuns: number;
}

export interface CodingRun {
  id: string;
  issueId: string;
  repositoryId?: string;
  issueIdentifier: string;
  mode: "Investigate" | "Propose fix" | "Implement fix";
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "canceled"
    | "approved"
    | "rejected";
  progress: number;
  startedAt: string;
  duration: string;
  summary: string;
  branch?: string;
  commit?: string;
  published?: boolean;
  deployed?: boolean;
  files: string[];
  diff?: string;
  diffTruncated?: boolean;
  checks?: Array<{ name: string; exitCode: number; output: string }>;
  caseId?: string;
  caseStatus?:
    | "active"
    | "awaiting_human"
    | "completed"
    | "failed"
    | "canceled";
  stage?: BugLoopStage;
  provider?: CodingAgentProvider;
  providerVersion?: string;
  suspicionScore?: number;
  verdict?: BugVerdict;
  decision?: BugDecision;
  evidence?: BugEvidence[];
  pullRequest?: {
    number: number;
    url: string;
    head?: string;
    base?: string;
    draft?: boolean;
  };
  mergeSha?: string;
  deploymentUrl?: string;
  healthStatus?: string;
  customerResponseStatus?: string;
  caseOnly?: boolean;
  codingStage?: "research" | "implement" | "review" | "verify";
  parentRunId?: string;
  researchArtifactId?: string;
  connectionId?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
    quota?: Record<string, unknown>;
    cache?: Record<string, unknown>;
    cost?: {
      method:
        | "included_in_subscription"
        | "reported"
        | "calculated"
        | "unknown";
      amountUsd?: number;
    };
  };
  attempts?: Array<{
    attemptNumber: number;
    provider?: CodingAgentProvider;
    requestedModel?: string;
    realModel?: string;
    effort?: string;
    authMethod?: "api_key" | "subscription";
    status: "queued" | "running" | "completed" | "failed" | "canceled";
    totalTokens?: number;
    costAmountUsd?: number;
    costStatus?: string;
    errorCategory?: string;
    errorMessage?: string;
  }>;
  events: RunEvent[];
}

export type CodingAgentProvider = "openai" | "anthropic" | "google" | "verboo";

export type BugLoopStage =
  | "signal"
  | "suspicion"
  | "evidence"
  | "investigation"
  | "verdict"
  | "decision"
  | "fix"
  | "verification"
  | "pull_request"
  | "approval"
  | "merge"
  | "deploy"
  | "health_check"
  | "customer_response"
  | "completed"
  | "failed";

export type BugVerdict =
  | "pending"
  | "confirmed"
  | "not_reproduced"
  | "not_a_bug"
  | "duplicate"
  | "needs_human";

export type BugDecision =
  | "pending"
  | "notify"
  | "autofix"
  | "manual_fix"
  | "dismiss";

export interface BugEvidence {
  kind: string;
  label: string;
  detail?: string;
}

export interface RunEvent {
  id: string;
  label: string;
  detail: string;
  time: string;
  occurredAt?: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  excerpt: string;
  status: "Published" | "Draft";
  productIds?: string[];
  managedBySync?: boolean;
  sourcePath?: string | null;
  sourceRevision?: string | null;
}

export interface KnowledgeProduct {
  id: string;
  key: string;
  name: string;
  description: string;
  aliases: string[];
  status: "active" | "archived";
}

export interface KnowledgeSourceSummary {
  id: string;
  repositoryId: string;
  repositoryName: string;
  productIds: string[];
  refName: string;
  observedSha?: string;
  indexedSha?: string;
  activeSha?: string;
  freshness: "empty" | "stale" | "current";
  syncState: "idle" | "queued" | "running" | "ready" | "stale" | "failed";
  lastSyncAt?: string;
  errorCode?: string;
}

/** The Zelo store behind a support contact, as the server summarizes it. */
export interface ZeloCustomer {
  ownerUserId: string;
  storeName: string;
  city: string | null;
  customerSince: string | null;
  /** Which phone of the store matched the contact. */
  matchedBy: "store" | "whatsapp" | "manager";
  deletionScheduledAt: string | null;
  subscription: {
    planTier: string | null;
    status: string | null;
    accessUntil: string | null;
    cancelAtPeriodEnd: boolean;
    billingType: string | null;
    paymentProvider: string | null;
    monthlyValueCents: number | null;
    nextChargeAt: string | null;
  } | null;
  products: {
    pdv: boolean;
    menu: boolean;
    chat: boolean;
    tables: boolean;
    accesses: boolean;
    fiscal: boolean;
  };
  health: {
    pdvLastSeenAt: string | null;
    whatsappConnected: boolean | null;
    printerLastSeenAt: string | null;
  };
}
