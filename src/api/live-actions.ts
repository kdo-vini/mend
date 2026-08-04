import type { User } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import {
  isSupabaseConfigured,
  supabase,
  type MendSupabaseClient,
} from "../lib/supabase";
import type {
  CodingRun,
  Conversation as UiConversation,
  Issue,
  IssueType,
  Priority,
} from "../types";
import {
  toUiConversation,
  toUiIssue,
  toUiKnowledge,
  toUiRun,
  type WorkspaceData,
} from "./live-mappers";

type Tables = Database["public"]["Tables"];
type Workspace = Tables["workspaces"]["Row"];
type Conversation = Tables["conversations"]["Row"];
type Message = Tables["messages"]["Row"];
type IssueRow = Tables["issues"]["Row"];
type RunRow = Tables["coding_runs"]["Row"];
type KnowledgeRow = Tables["knowledge_articles"]["Row"];

export interface LiveRepository {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  allowedCommands: string[];
}

const env =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {};
export const mendApiBaseUrl = (
  env.VITE_MEND_API_URL ??
  env.VITE_API_BASE_URL ??
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");
export const mendApiToken = env.VITE_MEND_API_TOKEN;
export const isMendApiConfigured = Boolean(mendApiBaseUrl);
export const isLiveConfigured = isSupabaseConfigured || Boolean(mendApiBaseUrl);

export function isDemoModeRequested() {
  if (env.VITE_MEND_DEMO === "true" || env.VITE_MEND_DEMO_MODE === "1")
    return true;
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("demo") === "1" ||
    window.sessionStorage.getItem("mend.demo") === "1"
  );
}

export function enableDemoMode() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("mend.demo", "1");
    window.location.reload();
  }
}

export class LiveActionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LiveActionError";
  }
}

async function unwrap<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw new LiveActionError(error.message);
  if (data === null)
    throw new LiveActionError("The live workspace returned no data.");
  return data;
}

function requireClient(client: MendSupabaseClient | null) {
  if (!client)
    throw new LiveActionError(
      "Supabase is not configured for live workspace data.",
    );
  return client;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  workspaceId?: string,
): Promise<T> {
  if (!mendApiBaseUrl)
    throw new LiveActionError(
      "Mend API is not configured. Set VITE_MEND_API_URL.",
    );
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (mendApiToken) headers.set("authorization", `Bearer ${mendApiToken}`);
  if (!mendApiToken && supabase) {
    const session = await supabase.auth.getSession();
    if (session.data.session?.access_token)
      headers.set(
        "authorization",
        `Bearer ${session.data.session.access_token}`,
      );
  }
  if (workspaceId) headers.set("x-mend-workspace-id", workspaceId);
  const response = await fetch(`${mendApiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  const body =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
  const apiError =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
  const message =
    typeof apiError === "string"
      ? apiError
      : apiError &&
          typeof apiError === "object" &&
          "message" in apiError &&
          typeof apiError.message === "string"
        ? apiError.message
        : `Mend API request failed (${response.status}).`;
  if (!response.ok) throw new LiveActionError(message, response.status);
  return body as T;
}

const dbPriority = (value: Priority) =>
  ({
    Urgent: "urgent",
    High: "high",
    Medium: "medium",
    Low: "low",
    "No priority": "none",
  })[value] ?? "none";
const dbType = (value: IssueType) =>
  ({
    "Production Bug": "production_bug",
    Bug: "bug",
    Incident: "incident",
    Feature: "feature",
    Task: "task",
    Billing: "billing",
    Commercial: "commercial",
    Question: "question",
    Other: "other",
  })[value] ?? "other";
const dbStatus = (value: Issue["status"]) =>
  ({
    Triage: "triage",
    Backlog: "backlog",
    Todo: "todo",
    "In Progress": "in_progress",
    Review: "review",
    Done: "done",
    Canceled: "canceled",
  })[value] ?? "triage";
const dbRunMode = (value: CodingRun["mode"]) =>
  ({
    Investigate: "investigate",
    "Propose fix": "propose_fix",
    "Implement fix": "implement_fix",
  })[value] ?? "investigate";

export async function getCurrentUser(
  client: MendSupabaseClient | null = supabase,
): Promise<User | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) throw new LiveActionError(error.message);
  return data.user;
}

export async function listLiveWorkspaces(
  client: MendSupabaseClient | null = supabase,
): Promise<Workspace[]> {
  return unwrap(
    requireClient(client)
      .from("workspaces")
      .select("*")
      .order("name", { ascending: true }),
  );
}

export async function loadLiveWorkspace(
  client: MendSupabaseClient | null = supabase,
  workspaceId?: string,
): Promise<WorkspaceData> {
  const db = requireClient(client);
  const workspaces = await listLiveWorkspaces(db);
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? workspaces[0] ?? null;
  if (!workspace)
    return {
      workspaces,
      workspace: null,
      conversations: [],
      issues: [],
      runs: [],
      knowledge: [],
      channels: [],
    };

  const [
    contacts,
    channels,
    conversations,
    messages,
    issues,
    runs,
    events,
    knowledge,
    aiStates,
  ] = await Promise.all([
    unwrap(db.from("contacts").select("*").eq("workspace_id", workspace.id)),
    unwrap(
      db
        .from("channel_connections")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("name"),
    ),
    unwrap(
      db
        .from("conversations")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
    ),
    unwrap(
      db
        .from("messages")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: true }),
    ),
    unwrap(
      db
        .from("issues")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("updated_at", { ascending: false }),
    ),
    unwrap(
      db
        .from("coding_runs")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
    ),
    unwrap(
      db
        .from("coding_run_events")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: true }),
    ),
    unwrap(
      db
        .from("knowledge_articles")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("updated_at", { ascending: false }),
    ),
    unwrap(
      db
        .from("conversation_ai_state")
        .select("*")
        .eq("workspace_id", workspace.id),
    ),
  ]);
  const aiStateByConversation = new Map(
    aiStates.map((state) => [state.conversation_id, state]),
  );
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const issueByConversation = new Map(
    issues
      .filter((issue) => issue.conversation_id)
      .map((issue) => [issue.conversation_id!, issue]),
  );
  const messagesByConversation = new Map<string, Message[]>();
  for (const message of messages)
    messagesByConversation.set(message.conversation_id, [
      ...(messagesByConversation.get(message.conversation_id) ?? []),
      message,
    ]);
  const customerByContact = new Map(
    contacts.map((contact) => [contact.id, contact.display_name]),
  );
  const issueIds = issues.map((issue) => issue.id);
  const [labels, issueLabels] = await Promise.all([
    unwrap(db.from("labels").select("*").eq("workspace_id", workspace.id)),
    issueIds.length
      ? unwrap(db.from("issue_labels").select("*").in("issue_id", issueIds))
      : Promise.resolve([]),
  ]);
  const labelNameById = new Map(labels.map((label) => [label.id, label.name]));
  const labelsByIssue = new Map<string, string[]>();
  for (const link of issueLabels) {
    const name = labelNameById.get(link.label_id);
    if (name)
      labelsByIssue.set(link.issue_id, [
        ...(labelsByIssue.get(link.issue_id) ?? []),
        name,
      ]);
  }
  const runCountByIssue = new Map<string, number>();
  for (const run of runs)
    runCountByIssue.set(
      run.issue_id,
      (runCountByIssue.get(run.issue_id) ?? 0) + 1,
    );
  return {
    workspaces,
    workspace,
    channels,
    conversations: conversations.map((conversation) =>
      toUiConversation(
        conversation,
        contactById.get(conversation.contact_id),
        messagesByConversation.get(conversation.id) ?? [],
        issueByConversation.get(conversation.id),
        aiStateByConversation.get(conversation.id),
      ),
    ),
    issues: issues.map((issue) =>
      toUiIssue(
        issue,
        issue.contact_id ? customerByContact.get(issue.contact_id) : undefined,
        {
          labels: labelsByIssue.get(issue.id) ?? [],
          codexRuns: runCountByIssue.get(issue.id) ?? 0,
        },
      ),
    ),
    runs: runs.map((run) =>
      toUiRun(
        run,
        events,
        issues.find((issue) => issue.id === run.issue_id)?.identifier,
      ),
    ),
    knowledge: knowledge.map(toUiKnowledge),
  };
}

/** Load only the conversation affected by a realtime event. */
export async function loadLiveConversationSnapshot(
  client: MendSupabaseClient | null,
  workspaceId: string,
  conversationId: string,
): Promise<UiConversation | null> {
  const db = requireClient(client);
  const [conversationResult, messagesResult] = await Promise.all([
    db
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .maybeSingle(),
    db
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);
  if (conversationResult.error)
    throw new LiveActionError(conversationResult.error.message);
  if (messagesResult.error)
    throw new LiveActionError(messagesResult.error.message);
  if (!conversationResult.data) return null;

  const [contactResult, issueResult, aiStateResult] = await Promise.all([
    db
      .from("contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationResult.data.contact_id)
      .maybeSingle(),
    db
      .from("issues")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
    db
      .from("conversation_ai_state")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
  ]);
  if (contactResult.error)
    throw new LiveActionError(contactResult.error.message);
  if (issueResult.error) throw new LiveActionError(issueResult.error.message);
  if (aiStateResult.error)
    throw new LiveActionError(aiStateResult.error.message);
  return toUiConversation(
    conversationResult.data,
    contactResult.data ?? undefined,
    messagesResult.data ?? [],
    issueResult.data ?? undefined,
    aiStateResult.data ?? undefined,
  );
}

export interface LiveWorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "agent" | "viewer" | string;
  createdAt?: string | null;
}

export interface LiveAuditLogEntry {
  id: string;
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
}

function queryString(values: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      query.set(key, String(value));
  const result = query.toString();
  return result ? `?${result}` : "";
}

export async function listLiveWorkspaceMembers(
  workspaceId: string,
  options: { role?: string; limit?: number; cursor?: string } = {},
): Promise<LiveWorkspaceMember[]> {
  const result = await apiRequest<{ data: LiveWorkspaceMember[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members${queryString(options)}`,
    {},
    workspaceId,
  );
  return result.data ?? [];
}

export async function addLiveWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  role?: "owner" | "admin" | "agent" | "viewer";
}) {
  return apiRequest<LiveWorkspaceMember>(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/members`,
    {
      method: "POST",
      body: JSON.stringify({
        userId: input.userId,
        role: input.role ?? "agent",
      }),
    },
    input.workspaceId,
  );
}

export async function updateLiveWorkspaceMemberRole(input: {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "agent" | "viewer";
}) {
  return apiRequest<LiveWorkspaceMember>(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.userId)}`,
    { method: "PATCH", body: JSON.stringify({ role: input.role }) },
    input.workspaceId,
  );
}

export async function removeLiveWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
}) {
  return apiRequest<void>(
    `/api/workspaces/${encodeURIComponent(input.workspaceId)}/members/${encodeURIComponent(input.userId)}`,
    { method: "DELETE" },
    input.workspaceId,
  );
}

export async function listLiveAuditLog(
  workspaceId: string,
  options: {
    action?: string;
    entityType?: string;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<LiveAuditLogEntry[]> {
  const result = await apiRequest<{ data: LiveAuditLogEntry[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/audit-log${queryString(options)}`,
    {},
    workspaceId,
  );
  return result.data ?? [];
}

export interface LiveIssueListFilters {
  status?: string;
  priority?: string;
  assignedUserId?: string;
  search?: string;
  type?: string;
  source?: string;
  label?: string;
  contactId?: string;
  conversationId?: string;
  hasCodex?: boolean;
  limit?: number;
  cursor?: string;
}

export async function listLiveIssues(
  workspaceId: string,
  filters: LiveIssueListFilters = {},
): Promise<Array<Record<string, unknown>>> {
  const result = await apiRequest<{ data: Array<Record<string, unknown>> }>(
    `/api/issues${queryString(filters)}`,
    {},
    workspaceId,
  );
  return result.data ?? [];
}

export async function getLiveIssueHistory(input: {
  workspaceId: string;
  identifier: string;
}) {
  return apiRequest<{
    issue: Record<string, unknown>;
    comments: unknown[];
    evidence: unknown[];
    timeline: unknown[];
  }>(
    `/api/issues/${encodeURIComponent(input.identifier)}/history`,
    {},
    input.workspaceId,
  );
}

export async function sendLiveMessage(input: {
  workspaceId: string;
  conversationId: string;
  text: string;
  instanceName?: string;
  idempotencyKey?: string;
}) {
  if (!input.text.trim())
    throw new LiveActionError("Message text is required.");
  return apiRequest<{ message?: unknown }>(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messageType: "text",
        text: input.text.trim(),
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      }),
    },
    input.workspaceId,
  );
}

export async function sendLiveMedia(input: {
  workspaceId: string;
  conversationId: string;
  mediaUrl?: string;
  file?: File;
  messageType: "image" | "video" | "audio" | "document";
  mimeType?: string;
  fileName?: string;
  caption?: string;
  idempotencyKey?: string;
}) {
  if (!mendApiBaseUrl)
    throw new LiveActionError(
      "Sending media needs the Mend API endpoint. Set VITE_MEND_API_URL.",
    );
  const mediaUrl = input.mediaUrl?.trim();
  let mediaDataUrl: string | undefined;
  let mimeType = input.mimeType;
  let fileName = input.fileName;
  if (input.file) {
    const maxBrowserAttachmentBytes = 8 * 1024 * 1024;
    const allowedMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/opus",
      "application/pdf",
      "text/plain",
    ]);
    if (mediaUrl)
      throw new LiveActionError(
        "Provide either a file or a remote media URL, not both.",
      );
    if (!input.file.size || input.file.size > maxBrowserAttachmentBytes)
      throw new LiveActionError("Attachment exceeds the 8 MB browser limit.");
    mimeType = mimeType ?? input.file.type;
    if (!mimeType || !allowedMimeTypes.has(mimeType.toLowerCase()))
      throw new LiveActionError("Attachment MIME type is not supported.");
    fileName = fileName ?? input.file.name;
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    mediaDataUrl = `data:${mimeType};base64,${globalThis.btoa(binary)}`;
  }
  if (!mediaUrl && !mediaDataUrl)
    throw new LiveActionError("Media URL or file is required.");
  return apiRequest<{ message?: unknown }>(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messageType: input.messageType,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaDataUrl ? { mediaDataUrl } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(fileName ? { fileName } : {}),
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      }),
    },
    input.workspaceId,
  );
}

export async function updateLiveConversation(
  input: {
    workspaceId: string;
    conversationId: string;
    updates: Partial<
      Pick<
        Conversation,
        | "status"
        | "attention_state"
        | "ai_mode"
        | "unread_count"
        | "assigned_user_id"
        | "snoozed_until"
      >
    >;
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl) {
    const updates = input.updates;
    if (updates.unread_count === 0)
      await apiRequest(
        `/api/conversations/${input.conversationId}/read`,
        { method: "POST", body: JSON.stringify({}) },
        input.workspaceId,
      );
    const patch = {
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.attention_state !== undefined
        ? { attentionState: updates.attention_state }
        : {}),
      ...(updates.ai_mode !== undefined ? { aiMode: updates.ai_mode } : {}),
      ...(updates.assigned_user_id !== undefined
        ? { assignedUserId: updates.assigned_user_id }
        : {}),
      ...(updates.snoozed_until !== undefined
        ? { snoozedUntil: updates.snoozed_until }
        : {}),
    };
    const updated = Object.keys(patch).length
      ? await apiRequest<Conversation>(
          `/api/conversations/${input.conversationId}`,
          { method: "PATCH", body: JSON.stringify(patch) },
          input.workspaceId,
        )
      : undefined;
    if (updates.unread_count !== undefined && updates.unread_count > 0) {
      // The public API intentionally exposes only the read transition. For
      // mark-unread, use the authenticated RLS client so the local counter and
      // attention state are updated atomically without trusting the browser's
      // workspace id.
      const db = requireClient(client);
      return unwrap(
        db
          .from("conversations")
          .update({
            unread_count: Math.max(1, updates.unread_count),
            attention_state: "needs_attention",
            status: "open",
            resolved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", input.workspaceId)
          .eq("id", input.conversationId)
          .select("*")
          .single(),
      );
    }
    return updated;
  }
  return unwrap(
    requireClient(client)
      .from("conversations")
      .update(input.updates)
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.conversationId)
      .select("*")
      .single(),
  );
}

export async function pauseLiveConversationAi(input: {
  workspaceId: string;
  conversationId: string;
  reason?:
    | "human_message"
    | "customer_requested_human"
    | "unsafe_intent"
    | "low_confidence"
    | "manual_pause";
}) {
  if (!mendApiBaseUrl)
    throw new LiveActionError("Pausing AI needs the Mend API endpoint.");
  return apiRequest(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/ai/pause`,
    {
      method: "POST",
      body: JSON.stringify({ reason: input.reason ?? "manual_pause" }),
    },
    input.workspaceId,
  );
}

export async function resumeLiveConversationAi(input: {
  workspaceId: string;
  conversationId: string;
}) {
  if (!mendApiBaseUrl)
    throw new LiveActionError("Resuming AI needs the Mend API endpoint.");
  return apiRequest(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/ai/resume`,
    { method: "POST", body: JSON.stringify({}) },
    input.workspaceId,
  );
}

export async function markLiveConversationRead(input: {
  workspaceId: string;
  conversationId: string;
}) {
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/conversations/${encodeURIComponent(input.conversationId)}/read`,
      { method: "POST", body: JSON.stringify({}) },
      input.workspaceId,
    );
  return updateLiveConversation({
    ...input,
    updates: { unread_count: 0 },
  });
}

export async function snoozeLiveConversation(input: {
  workspaceId: string;
  conversationId: string;
  until: string;
}) {
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/conversations/${encodeURIComponent(input.conversationId)}/snooze`,
      { method: "POST", body: JSON.stringify({ until: input.until }) },
      input.workspaceId,
    );
  return updateLiveConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    updates: { status: "snoozed", snoozed_until: input.until },
  });
}

export async function resolveLiveConversation(input: {
  workspaceId: string;
  conversationId: string;
}) {
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/conversations/${encodeURIComponent(input.conversationId)}/resolve`,
      { method: "POST", body: JSON.stringify({}) },
      input.workspaceId,
    );
  return updateLiveConversation({
    ...input,
    updates: { status: "resolved", attention_state: "none" },
  });
}

export async function createLiveIssue(
  input: {
    workspaceId: string;
    title: string;
    type: IssueType;
    priority: Priority;
    conversationId?: string;
    description?: string;
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest<IssueRow | { issue: IssueRow }>(
      "/api/issues",
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title.trim(),
          type: dbType(input.type),
          priority: dbPriority(input.priority),
          status: "triage",
          source: input.conversationId ? "conversation" : "internal",
          ...(input.conversationId
            ? { conversationId: input.conversationId }
            : {}),
          ...(input.description?.trim()
            ? { description: input.description.trim() }
            : {}),
        }),
      },
      input.workspaceId,
    ).then((result) => ("issue" in result ? result.issue : result));
  const db = requireClient(client);
  const identifier = await unwrap(
    db.rpc("claim_issue_number", { target_workspace_id: input.workspaceId }),
  );
  const number = Number(String(identifier).split("-").at(-1));
  if (!Number.isSafeInteger(number))
    throw new LiveActionError(
      "The workspace did not return a valid issue number.",
    );
  return unwrap(
    db
      .from("issues")
      .insert({
        workspace_id: input.workspaceId,
        number,
        identifier: String(identifier),
        title: input.title.trim(),
        type: dbType(input.type),
        priority: dbPriority(input.priority),
        status: "triage",
        source: input.conversationId ? "conversation" : "internal",
        conversation_id: input.conversationId ?? null,
        description: input.description ?? null,
        created_by: "user",
      })
      .select("*")
      .single(),
  );
}

export async function updateLiveIssue(
  input: {
    workspaceId: string;
    issueId: string;
    issueIdentifier?: string;
    patch: Partial<Issue>;
  },
  client: MendSupabaseClient | null = supabase,
) {
  const updates: Tables["issues"]["Update"] = {};
  if (input.patch.title !== undefined) updates.title = input.patch.title;
  if (input.patch.summary !== undefined)
    updates.ai_summary = input.patch.summary;
  if (input.patch.impact !== undefined) updates.impact = input.patch.impact;
  if (input.patch.status !== undefined)
    updates.status = dbStatus(input.patch.status);
  if (input.patch.priority !== undefined)
    updates.priority = dbPriority(input.patch.priority);
  if (input.patch.type !== undefined) updates.type = dbType(input.patch.type);
  if (input.patch.assignee !== undefined)
    updates.assigned_user_id =
      input.patch.assignee === "Unassigned" || input.patch.assignee === "AI"
        ? null
        : input.patch.assignee;
  if (input.patch.labels !== undefined)
    (updates as Tables["issues"]["Update"] & { labels?: string[] }).labels =
      input.patch.labels;
  if (mendApiBaseUrl) {
    const apiPatch = {
      ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
      ...(input.patch.summary !== undefined
        ? { aiSummary: input.patch.summary }
        : {}),
      ...(input.patch.impact !== undefined
        ? { impact: input.patch.impact }
        : {}),
      ...(input.patch.status !== undefined
        ? { status: dbStatus(input.patch.status) }
        : {}),
      ...(input.patch.priority !== undefined
        ? { priority: dbPriority(input.patch.priority) }
        : {}),
      ...(input.patch.type !== undefined
        ? { type: dbType(input.patch.type) }
        : {}),
      ...(input.patch.assignee !== undefined
        ? {
            assignedUserId:
              input.patch.assignee === "Unassigned" ||
              input.patch.assignee === "AI"
                ? null
                : input.patch.assignee,
          }
        : {}),
      ...(input.patch.labels !== undefined
        ? { labels: input.patch.labels }
        : {}),
    };
    return apiRequest<IssueRow | { issue: IssueRow }>(
      `/api/issues/${encodeURIComponent(input.issueIdentifier ?? input.issueId)}`,
      { method: "PATCH", body: JSON.stringify(apiPatch) },
      input.workspaceId,
    ).then((result) => ("issue" in result ? result.issue : result));
  }
  return unwrap(
    requireClient(client)
      .from("issues")
      .update(updates)
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.issueId)
      .select("*")
      .single(),
  );
}

export async function createLiveIssueComment(
  input: {
    workspaceId: string;
    issueId: string;
    issueIdentifier?: string;
    body: string;
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (!input.body.trim()) throw new LiveActionError("Comment cannot be empty.");
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/issues/${encodeURIComponent(input.issueIdentifier ?? input.issueId)}/comments`,
      { method: "POST", body: JSON.stringify({ body: input.body.trim() }) },
      input.workspaceId,
    );
  return unwrap(
    requireClient(client)
      .from("issue_comments")
      .insert({
        workspace_id: input.workspaceId,
        issue_id: input.issueId,
        body: input.body.trim(),
        author_type: "user",
      })
      .select("*")
      .single(),
  );
}

export async function addLiveEvidence(input: {
  workspaceId: string;
  issueId: string;
  issueIdentifier?: string;
  file: File;
}) {
  if (!mendApiBaseUrl)
    throw new LiveActionError(
      "Evidence upload needs the Mend API endpoint. Set VITE_MEND_API_URL.",
    );
  const form = new FormData();
  form.append("file", input.file);
  form.append("issueId", input.issueIdentifier ?? input.issueId);
  const headers = new Headers();
  if (mendApiToken) headers.set("authorization", `Bearer ${mendApiToken}`);
  headers.set("x-mend-workspace-id", input.workspaceId);
  const response = await fetch(
    `${mendApiBaseUrl}/api/issues/${encodeURIComponent(input.issueIdentifier ?? input.issueId)}/evidence`,
    { method: "POST", headers, body: form },
  );
  if (!response.ok)
    throw new LiveActionError(
      `Evidence upload failed (${response.status}).`,
      response.status,
    );
  return response.json();
}

export async function addLiveTextEvidence(
  input: {
    workspaceId: string;
    issueId: string;
    issueIdentifier?: string;
    label: string;
    body: string;
  },
  _client: MendSupabaseClient | null = supabase,
) {
  if (!input.label.trim() || !input.body.trim())
    throw new LiveActionError("Evidence label and text are required.");
  const path = `/api/issues/${encodeURIComponent(input.issueIdentifier ?? input.issueId)}/evidence`;
  if (mendApiBaseUrl)
    return apiRequest(
      path,
      {
        method: "POST",
        body: JSON.stringify({
          kind: "text",
          label: input.label.trim(),
          body: input.body.trim(),
        }),
      },
      input.workspaceId,
    );
  throw new LiveActionError(
    "Evidence actions need the Mend API endpoint. Set VITE_MEND_API_URL.",
  );
}

export async function createLiveKnowledge(
  input: {
    workspaceId: string;
    title: string;
    category: string;
    body: string;
    status?: "draft" | "published";
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest<KnowledgeRow | { article: KnowledgeRow }>(
      "/api/knowledge",
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title.trim(),
          category: input.category.trim() || "Support",
          body: input.body.trim(),
          status: input.status ?? "draft",
        }),
      },
      input.workspaceId,
    ).then((result) => ("article" in result ? result.article : result));
  return unwrap(
    requireClient(client)
      .from("knowledge_articles")
      .insert({
        workspace_id: input.workspaceId,
        title: input.title.trim(),
        category: input.category.trim() || "Support",
        body: input.body.trim(),
        status: input.status ?? "draft",
      })
      .select("*")
      .single(),
  );
}

export async function listLivePublishedKnowledge(
  workspaceId: string,
  client: MendSupabaseClient | null = supabase,
): Promise<KnowledgeRow[]> {
  if (mendApiBaseUrl) {
    const result = await apiRequest<{ data: KnowledgeRow[] }>(
      "/api/knowledge?status=published",
      {},
      workspaceId,
    );
    return result.data ?? [];
  }
  return unwrap(
    requireClient(client)
      .from("knowledge_articles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("updated_at", { ascending: false }),
  );
}

export async function updateLiveKnowledge(
  input: {
    workspaceId: string;
    articleId: string;
    patch: {
      title?: string;
      category?: string;
      body?: string;
      status?: "draft" | "published";
    };
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest<KnowledgeRow | { article: KnowledgeRow }>(
      `/api/knowledge/${input.articleId}`,
      { method: "PATCH", body: JSON.stringify(input.patch) },
      input.workspaceId,
    ).then((result) => ("article" in result ? result.article : result));
  return unwrap(
    requireClient(client)
      .from("knowledge_articles")
      .update(input.patch)
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.articleId)
      .select("*")
      .single(),
  );
}

export async function deleteLiveKnowledge(
  input: { workspaceId: string; articleId: string },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/knowledge/${input.articleId}`,
      { method: "DELETE" },
      input.workspaceId,
    );
  return unwrap(
    requireClient(client)
      .from("knowledge_articles")
      .delete()
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.articleId)
      .select("id")
      .single(),
  );
}

export async function startLiveCodexRun(
  input: {
    workspaceId: string;
    issueId: string;
    issueIdentifier?: string;
    mode: CodingRun["mode"];
    instructions?: string;
    repositoryId?: string;
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest<RunRow | { run: RunRow }>(
      `/api/issues/${encodeURIComponent(input.issueIdentifier ?? input.issueId)}/coding-runs`,
      {
        method: "POST",
        body: JSON.stringify({
          mode: dbRunMode(input.mode),
          instructions: input.instructions,
          ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
        }),
      },
      input.workspaceId,
    ).then((result) => ("run" in result ? result.run : result));
  return unwrap(
    requireClient(client)
      .from("coding_runs")
      .insert({
        workspace_id: input.workspaceId,
        issue_id: input.issueId,
        mode: dbRunMode(input.mode),
        status: "queued",
        result_json: { instructions: input.instructions ?? "" },
      })
      .select("*")
      .single(),
  );
}

export async function listLiveRepositories(
  workspaceId: string,
): Promise<LiveRepository[]> {
  const result = await apiRequest<{ data: ApiRepository[] }>(
    "/api/repositories",
    {},
    workspaceId,
  );
  return (result.data ?? []).map(repositoryToLive);
}

export async function createLiveRepository(input: {
  workspaceId: string;
  name: string;
  localPath: string;
  defaultBranch?: string;
  allowedCommands?: string[];
}): Promise<LiveRepository> {
  const result = await apiRequest<ApiRepository>(
    "/api/repositories",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name.trim(),
        localPath: input.localPath.trim(),
        defaultBranch: input.defaultBranch?.trim() || "main",
        allowedCommands: input.allowedCommands,
      }),
    },
    input.workspaceId,
  );
  return repositoryToLive(result);
}

export async function updateLiveCodexRun(
  input: {
    workspaceId: string;
    runId: string;
    action: "cancel" | "approve" | "reject";
  },
  client: MendSupabaseClient | null = supabase,
) {
  if (mendApiBaseUrl)
    return apiRequest(
      `/api/codex/runs/${input.runId}/${input.action}`,
      { method: "POST", body: JSON.stringify({}) },
      input.workspaceId,
    );
  const status =
    input.action === "cancel"
      ? "canceled"
      : input.action === "approve"
        ? "approved"
        : "rejected";
  return unwrap(
    requireClient(client)
      .from("coding_runs")
      .update({ status })
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.runId)
      .select("*")
      .single(),
  );
}

export interface WhatsAppInstance {
  instanceName: string;
  state: string;
  phoneNumber?: string | null;
  qr?: string | null;
  channelId?: string;
  name?: string;
}

type ApiRepository = {
  id: string;
  name: string;
  localPath?: string;
  local_path?: string;
  defaultBranch?: string;
  default_branch?: string;
  allowedCommands?: string[];
  allowed_commands?: string[];
};

function repositoryToLive(repository: ApiRepository): LiveRepository {
  return {
    id: repository.id,
    name: repository.name,
    localPath: repository.localPath ?? repository.local_path ?? "",
    defaultBranch:
      repository.defaultBranch ?? repository.default_branch ?? "main",
    allowedCommands:
      repository.allowedCommands ?? repository.allowed_commands ?? [],
  };
}

type ApiChannel = {
  id: string;
  name: string;
  providerInstanceName?: string;
  provider_instance_name?: string;
  phoneNumber?: string | null;
  phone_number?: string | null;
  status: string;
};

function channelToInstance(channel: ApiChannel): WhatsAppInstance {
  return {
    channelId: channel.id,
    instanceName:
      channel.providerInstanceName ??
      channel.provider_instance_name ??
      channel.name,
    name: channel.name,
    phoneNumber: channel.phoneNumber ?? channel.phone_number ?? null,
    state: channel.status,
  };
}

export async function listLiveChannels(
  workspaceId: string,
): Promise<WhatsAppInstance[]> {
  const result = await apiRequest<{ data: ApiChannel[] }>(
    "/api/channels",
    {},
    workspaceId,
  );
  return (result.data ?? []).map(channelToInstance);
}

export async function createLiveChannel(input: {
  workspaceId: string;
  name: string;
  instanceName: string;
}): Promise<WhatsAppInstance> {
  const result = await apiRequest<ApiChannel>(
    "/api/channels/whatsmiau",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        providerInstanceName: input.instanceName,
      }),
    },
    input.workspaceId,
  );
  return channelToInstance(result);
}

export async function connectLiveChannel(input: {
  workspaceId: string;
  channelId: string;
}): Promise<WhatsAppInstance> {
  const result = await apiRequest<ApiChannel>(
    `/api/channels/${encodeURIComponent(input.channelId)}/connect`,
    { method: "POST", body: JSON.stringify({}) },
    input.workspaceId,
  );
  return channelToInstance(result);
}

export async function getLiveChannelQr(input: {
  workspaceId: string;
  channelId: string;
}): Promise<{ data: string; mimeType?: string }> {
  return apiRequest<{ data: string; mimeType?: string }>(
    `/api/channels/${encodeURIComponent(input.channelId)}/qr`,
    {},
    input.workspaceId,
  );
}

export async function refreshLiveChannel(input: {
  workspaceId: string;
  channelId: string;
}): Promise<WhatsAppInstance> {
  const result = await apiRequest<ApiChannel>(
    `/api/channels/${encodeURIComponent(input.channelId)}/refresh`,
    { method: "POST", body: JSON.stringify({}) },
    input.workspaceId,
  );
  return channelToInstance(result);
}

export async function disconnectLiveChannel(input: {
  workspaceId: string;
  channelId: string;
}): Promise<WhatsAppInstance> {
  const result = await apiRequest<ApiChannel>(
    `/api/channels/${encodeURIComponent(input.channelId)}/disconnect`,
    { method: "POST", body: JSON.stringify({}) },
    input.workspaceId,
  );
  return channelToInstance(result);
}

export function listWhatsAppInstances() {
  return apiRequest<WhatsAppInstance[]>("/api/whatsapp/instances");
}

export function createWhatsAppInstance(input: {
  instanceName: string;
  workspaceId: string;
}) {
  return apiRequest<WhatsAppInstance>(
    "/api/whatsapp/instances",
    {
      method: "POST",
      body: JSON.stringify({ instanceName: input.instanceName }),
    },
    input.workspaceId,
  );
}

export function connectWhatsAppInstance(input: {
  instanceName: string;
  workspaceId: string;
}) {
  return apiRequest<WhatsAppInstance>(
    `/api/whatsapp/instances/${encodeURIComponent(input.instanceName)}/connect`,
    { method: "POST", body: JSON.stringify({}) },
    input.workspaceId,
  );
}

export function getWhatsAppQr(input: {
  instanceName: string;
  workspaceId: string;
}) {
  return apiRequest<{ qr: string }>(
    `/api/whatsapp/instances/${encodeURIComponent(input.instanceName)}/qr`,
    {},
    input.workspaceId,
  );
}

export function refreshWhatsAppInstance(input: {
  instanceName: string;
  workspaceId: string;
}) {
  return apiRequest<WhatsAppInstance>(
    `/api/whatsapp/instances/${encodeURIComponent(input.instanceName)}/state`,
    {},
    input.workspaceId,
  );
}

export function disconnectWhatsAppInstance(input: {
  instanceName: string;
  workspaceId: string;
}) {
  return apiRequest<WhatsAppInstance>(
    `/api/whatsapp/instances/${encodeURIComponent(input.instanceName)}`,
    { method: "DELETE" },
    input.workspaceId,
  );
}

export function requestAiDraft(
  conversation: string,
  knowledgeContext: string[] = [],
  liveContext?: { workspaceId: string; conversationId: string },
) {
  if (liveContext && mendApiBaseUrl) {
    return apiRequest<{ draft: string; provider: string }>(
      `/api/conversations/${encodeURIComponent(liveContext.conversationId)}/ai-draft`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      liveContext.workspaceId,
    );
  }
  return apiRequest<{ draft: string; provider: string }>("/api/ai/draft", {
    method: "POST",
    body: JSON.stringify({
      conversation,
      ...(knowledgeContext.length
        ? { knowledge: knowledgeContext.join("\n\n") }
        : {}),
    }),
  });
}
