export type ConversationStatus = "open" | "snoozed" | "resolved";
export type AttentionState =
  | "needs_attention"
  | "ai_handling"
  | "waiting_customer"
  | "none";
export type AiMode = "off" | "draft" | "safe_auto";
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
  direction: "inbound" | "outbound";
  sender: string;
  text: string;
  time: string;
  type: MessageType;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  aiGenerated?: boolean;
  attachment?: { name: string; meta: string; url?: string };
  quotedMessageId?: string;
  deleted?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  company: string;
  phone: string;
  initials: string;
  accent: string;
  status: ConversationStatus;
  attention: AttentionState;
  aiMode: AiMode;
  unread: number;
  lastMessage: string;
  lastTime: string;
  lastMessageAt: string;
  issueId?: string;
  issueLabel?: string;
  priority?: Priority;
  assignee: string;
  messages: Message[];
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  type: IssueType;
  priority: Priority;
  status: IssueStatus;
  assignee: string;
  labels: string[];
  customer?: string;
  conversationId?: string;
  source: "Conversation" | "Internal";
  summary: string;
  impact: string;
  updatedAt: string;
  createdAt: string;
  codexRuns: number;
}

export interface CodingRun {
  id: string;
  issueId: string;
  issueIdentifier: string;
  mode: "Investigate" | "Propose fix" | "Implement fix";
  status:
    | "Completed"
    | "Running"
    | "Failed"
    | "Canceled"
    | "Approved"
    | "Rejected";
  progress: number;
  startedAt: string;
  duration: string;
  summary: string;
  branch?: string;
  commit?: string;
  files: string[];
  diff?: string;
  diffTruncated?: boolean;
  checks?: Array<{ name: string; exitCode: number; output: string }>;
  events: RunEvent[];
}

export interface RunEvent {
  id: string;
  label: string;
  detail: string;
  time: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  excerpt: string;
  status: "Published" | "Draft";
}
