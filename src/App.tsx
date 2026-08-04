import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Command,
  CornerDownRight,
  Ellipsis,
  FileCode2,
  FileText,
  Filter,
  GitBranch,
  Inbox as InboxIcon,
  Info,
  Keyboard,
  ListFilter,
  LockKeyhole,
  Menu,
  Moon,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Save,
  Tag,
  TerminalSquare,
  UserRound,
  UsersRound,
  LogOut,
  X,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "./components/ResourceState";
import { ProfileWorkspacePage } from "./components/ProfileWorkspacePage";
import { seedConversations, seedIssues, seedKnowledge, seedRuns } from "./data";
import type {
  AiMode,
  AiDraft,
  AutomationState,
  Conversation,
  Issue,
  IssueStatus,
  IssueType,
  KnowledgeArticle,
  Priority,
  CodingRun,
  Message,
} from "./types";
import {
  aiTriageRouteValues,
  triageIntentValues,
  type AiTriageRoute,
  type TriageIntent,
} from "./ai-policy";
import { supabase } from "./lib/supabase";
import {
  listMessagesSince,
  listWorkspaces,
  subscribeToWorkspace,
} from "./api/workspace-data";
import { createWorkspace, listWorkspaceMembers } from "./api/auth";
import {
  addLiveTextEvidence,
  connectLiveChannel,
  connectWhatsAppInstance,
  createLiveChannel,
  createLiveIssueComment,
  createLiveKnowledge,
  createLiveIssue,
  createLiveRepository,
  createWhatsAppInstance,
  deleteLiveIssue,
  deleteLiveKnowledge,
  disconnectLiveChannel,
  disconnectWhatsAppInstance,
  getLiveChannelQr,
  getLiveIssueHistory,
  getWhatsAppQr,
  isDemoModeRequested,
  isLiveConfigured,
  listLiveChannels,
  listLiveRepositories,
  listWhatsAppInstances,
  loadLiveConversationSnapshot,
  loadLiveWorkspace,
  markLiveConversationRead,
  mendApiBaseUrl,
  refreshLiveChannel,
  requestAiDraft,
  pauseLiveConversationAi,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMessage,
  snoozeLiveConversation,
  startLiveCodexRun,
  updateLiveCodexRun,
  updateLiveConversation,
  updateLiveIssue,
  updateLiveKnowledge,
  type WhatsAppInstance,
} from "./api/live-actions";
import { toUiKnowledge } from "./api/live-mappers";
import {
  listLiveAuditLog,
  listLiveWorkspaceMembers,
  loadLiveAiConversationPolicy,
  saveLiveConversationAiPolicy,
  saveLiveWorkspaceAiPolicy,
  type AuditLogRecord,
  type LiveWorkspaceAiPolicy,
  type WorkspaceMemberRecord,
} from "./api/settings-actions";

const navItems = [
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/issues", label: "Issues", icon: CircleDot },
  { to: "/codex-runs", label: "Codex runs", icon: TerminalSquare },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const triageIntentLabels: Record<TriageIntent, string> = {
  question: "Question / pricing",
  how_to: "How-to",
  status: "Status",
  bug: "Bug report",
  incident: "Incident",
  billing: "Billing",
  feature: "Feature request",
  other: "Other / unknown",
};

const triageRouteLabels: Record<AiTriageRoute, string> = {
  knowledge_auto_reply: "Answer from published knowledge",
  draft_for_review: "Draft for human review",
  human_escalation: "Escalate and notify human",
  bug_triage: "Bug triage",
  no_action: "No action",
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
const formatActivityTime = (value: unknown) => {
  if (typeof value !== "string" || !value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
};
const identityInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OP";
const appEnv =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {};
const localOperatorMode =
  appEnv.MODE === "development" && appEnv.VITE_MEND_LOCAL_OPERATOR_MODE === "1";

interface AssigneeOption {
  value: string;
  label: string;
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.lastMessageAt || "") || 0;
    const leftTime = Date.parse(left.lastMessageAt || "") || 0;
    return rightTime - leftTime;
  });
}

function mergeConversationSnapshot(
  current: Conversation[],
  snapshot: Conversation,
): Conversation[] {
  const existing = current.find((item) => item.id === snapshot.id);
  const persistedTextCounts = new Map(
    snapshot.messages.map((message) => [
      `${message.direction}:${message.text}`,
      snapshot.messages.filter(
        (candidate) =>
          candidate.direction === message.direction &&
          candidate.text === message.text,
      ).length,
    ]),
  );
  const pending = (existing?.messages ?? []).filter((message) => {
    if (!message.id.startsWith("temp:")) return false;
    const key = `${message.direction}:${message.text}`;
    const remaining = persistedTextCounts.get(key) ?? 0;
    if (remaining > 0) {
      persistedTextCounts.set(key, remaining - 1);
      return false;
    }
    return true;
  });
  const merged = { ...snapshot, messages: [...snapshot.messages, ...pending] };
  return sortConversations(
    existing
      ? current.map((item) => (item.id === snapshot.id ? merged : item))
      : [merged, ...current],
  );
}

function App() {
  const [demoMode] = useState(() => isDemoModeRequested() || !isLiveConfigured);
  const [conversations, setConversations] = useState<Conversation[]>(
    demoMode ? seedConversations : [],
  );
  const [issues, setIssues] = useState<Issue[]>(demoMode ? seedIssues : []);
  const [runs, setRuns] = useState<CodingRun[]>(demoMode ? seedRuns : []);
  const [knowledgeArticles, setKnowledgeArticles] = useState<
    KnowledgeArticle[]
  >(demoMode ? seedKnowledge : []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<
    Array<{ id: string; name: string }>
  >(demoMode ? [{ id: "demo", name: "Techne" }] : []);
  const [workspaceName, setWorkspaceName] = useState(
    demoMode ? "Techne" : "Workspace",
  );
  const [channel, setChannel] = useState<WhatsAppInstance | null>(null);
  const [liveDataError, setLiveDataError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(
    !demoMode && !localOperatorMode,
  );
  const [liveDataRetry, setLiveDataRetry] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("mend.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState(
    demoMode ? (seedConversations[0]?.id ?? "") : "",
  );
  const [operatorIdentity, setOperatorIdentity] = useState({
    id: "",
    name: "Current operator",
    email: "",
  });
  const [workspaceMemberIds, setWorkspaceMemberIds] = useState<string[]>([]);
  const [inspectorIssueId, setInspectorIssueId] = useState<string | null>(null);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [editIssueId, setEditIssueId] = useState<string | null>(null);
  const [runDialogIssueId, setRunDialogIssueId] = useState<string | null>(null);
  const handleProfileWorkspaceUpdated = useCallback(
    (workspace: { id: string; name: string }) => {
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setLiveDataRetry((current) => current + 1);
    },
    [],
  );
  const handleProfileIdentityUpdated = useCallback(
    (identity: { name: string; email: string }) => {
      setOperatorIdentity((current) => ({
        ...current,
        ...identity,
      }));
    },
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("mend.theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCreateIssueOpen(false);
        setRunDialogIssueId(null);
        setInspectorIssueId(null);
      }
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      ) {
        const search = document.querySelector<HTMLInputElement>(
          "[data-global-search]",
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const metadataName = data.user.user_metadata.full_name;
      const name =
        typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : (data.user.email?.split("@")[0] ?? "Current operator");
      setOperatorIdentity({
        id: data.user.id,
        name,
        email: data.user.email ?? "",
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (demoMode || !workspaceId || !supabase) return;
    let active = true;
    void listWorkspaceMembers(workspaceId, supabase)
      .then((members) => {
        if (active)
          setWorkspaceMemberIds(members.map((member) => member.user_id));
      })
      .catch(() => {
        if (active) setWorkspaceMemberIds([]);
      });
    return () => {
      active = false;
    };
  }, [demoMode, workspaceId]);

  const assigneeOptions: AssigneeOption[] = demoMode
    ? [
        { value: "Unassigned", label: "Unassigned" },
        { value: "Marina", label: "Marina" },
        { value: "João", label: "João" },
      ]
    : [
        { value: "Unassigned", label: "Unassigned" },
        ...workspaceMemberIds.map((userId) => ({
          value: userId,
          label:
            userId === operatorIdentity.id
              ? operatorIdentity.name
              : `User ${userId.slice(0, 8)}`,
        })),
      ];
  const assigneeLabel = (value: string) =>
    assigneeOptions.find((option) => option.value === value)?.label ??
    (value === "Unassigned" ? value : `User ${value.slice(0, 8)}`);

  useEffect(() => {
    if (demoMode || localOperatorMode) return;
    const client = supabase;
    if (!client) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let workspaceSubscribed = false;
    let lastKnownEventAt = new Date().toISOString();
    let reconcileQueue = Promise.resolve();
    const hydrate = async (showLoading = true) => {
      try {
        if (showLoading) setWorkspaceLoading(true);
        setLiveDataError(null);
        const availableWorkspaces = await listWorkspaces(client);
        const workspace =
          availableWorkspaces.find((item) => item.id === workspaceId) ??
          availableWorkspaces[0];
        if (active)
          setWorkspaceOptions(
            availableWorkspaces.map((item) => ({
              id: item.id,
              name: item.name,
            })),
          );
        if (!workspace) {
          if (active) setWorkspaceLoading(false);
          return;
        }
        if (!active) return;
        setWorkspaceId(workspace.id);
        setWorkspaceName(workspace.name);
        const liveData = await loadLiveWorkspace(client, workspace.id);
        if (!active) return;
        setConversations((current) =>
          liveData.conversations.reduce(
            (merged, snapshot) => mergeConversationSnapshot(merged, snapshot),
            current.filter((conversation) =>
              liveData.conversations.some(
                (snapshot) => snapshot.id === conversation.id,
              ),
            ),
          ),
        );
        setIssues(liveData.issues);
        setKnowledgeArticles(liveData.knowledge);
        setRuns(liveData.runs);
        lastKnownEventAt = new Date().toISOString();
        if (!workspaceSubscribed) {
          workspaceSubscribed = true;
          unsubscribe = subscribeToWorkspace(
            client,
            workspace.id,
            (payload) => {
              reconcileQueue = reconcileQueue
                .then(async () => {
                  if (!active) return;
                  const table = String(payload.table ?? "");
                  const row = (payload.new ?? payload.old ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const eventAt =
                    typeof payload.commit_timestamp === "string"
                      ? payload.commit_timestamp
                      : new Date().toISOString();
                  const isReconnect = table === "*";
                  if (!isReconnect && eventAt > lastKnownEventAt)
                    lastKnownEventAt = eventAt;

                  if (isReconnect) {
                    const since = lastKnownEventAt;
                    try {
                      await listMessagesSince(client, workspace.id, since);
                    } catch {
                      /* full snapshot below is the safe fallback */
                    }
                    await hydrate(false);
                    return;
                  }

                  if (
                    (table === "messages" || table === "conversations") &&
                    typeof row.id === "string"
                  ) {
                    const conversationId =
                      table === "messages"
                        ? String(row.conversation_id ?? "")
                        : row.id;
                    if (conversationId) {
                      const snapshot = await loadLiveConversationSnapshot(
                        client,
                        workspace.id,
                        conversationId,
                      );
                      if (snapshot && active)
                        setConversations((current) =>
                          mergeConversationSnapshot(current, snapshot),
                        );
                      return;
                    }
                  }

                  await hydrate(false);
                })
                .catch((error) => {
                  if (active)
                    setLiveDataError(
                      error instanceof Error
                        ? error.message
                        : "Live workspace reconciliation failed.",
                    );
                });
            },
          );
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error
              ? error.message
              : "The live workspace data could not be loaded.";
          setLiveDataError(message);
          setToast(`Live data unavailable: ${message}`);
        }
      } finally {
        if (active && showLoading) setWorkspaceLoading(false);
      }
    };
    void hydrate();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [demoMode, liveDataRetry, workspaceId]);

  useEffect(() => {
    if (demoMode || !mendApiBaseUrl) return;
    const request = workspaceId
      ? listLiveChannels(workspaceId)
      : listWhatsAppInstances();
    void request
      .then((instances) =>
        setChannel(
          instances.find((item) => item.state === "open") ??
            instances[0] ??
            null,
        ),
      )
      .catch(() => setChannel(null));
  }, [demoMode, liveDataRetry, workspaceId]);

  const createIssue = async (input: {
    title: string;
    type: IssueType;
    priority: Priority;
    conversationId?: string;
  }) => {
    if (!demoMode && workspaceId) {
      try {
        await createLiveIssue({ workspaceId, ...input });
        setCreateIssueOpen(false);
        setLiveDataRetry((current) => current + 1);
        setToast("Issue created in the live workspace");
      } catch (error) {
        setToast(
          error instanceof Error
            ? error.message
            : "Issue could not be created.",
        );
      }
      return;
    }
    const number =
      Math.max(
        0,
        ...issues.map((issue) => Number(issue.identifier.replace("TEC-", ""))),
      ) + 1;
    const conversation = input.conversationId
      ? conversations.find((item) => item.id === input.conversationId)
      : undefined;
    const issue: Issue = {
      id: `issue-${number}`,
      identifier: `TEC-${number}`,
      title: input.title,
      type: input.type,
      priority: input.priority,
      status: "Triage",
      assignee: "Unassigned",
      labels: ["new"],
      customer: conversation?.name,
      conversationId: input.conversationId,
      source: conversation ? "Conversation" : "Internal",
      summary: conversation
        ? conversation.lastMessage
        : "Internal work item created from the workspace.",
      impact: "Impact to be assessed during triage.",
      updatedAt: "Just now",
      createdAt: "Just now",
      codexRuns: 0,
    };
    setIssues((current) => [issue, ...current]);
    if (conversation) {
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? {
                ...item,
                issueId: issue.id,
                issueLabel: issue.identifier,
                priority: issue.priority,
              }
            : item,
        ),
      );
    }
    setInspectorIssueId(issue.id);
    setCreateIssueOpen(false);
    setToast(`${issue.identifier} created`);
  };

  const updateIssue = (issueId: string, patch: Partial<Issue>) => {
    const previous = issues.find((item) => item.id === issueId);
    if (!demoMode && workspaceId) {
      const issue = issues.find((item) => item.id === issueId);
      void updateLiveIssue({
        workspaceId,
        issueId,
        issueIdentifier: issue?.identifier,
        patch,
      })
        .then(() => setLiveDataRetry((current) => current + 1))
        .catch((error) => {
          if (previous)
            setIssues((current) =>
              current.map((item) => (item.id === issueId ? previous : item)),
            );
          setToast(
            error instanceof Error
              ? error.message
              : "Issue could not be updated.",
          );
        });
    }
    setIssues((current) =>
      current.map((issue) =>
        issue.id === issueId
          ? { ...issue, ...patch, updatedAt: "Just now" }
          : issue,
      ),
    );
  };

  const deleteIssue = async (issueId: string) => {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${issue.identifier}? This cannot be undone.`)
    )
      return;
    try {
      if (!demoMode && workspaceId) {
        await deleteLiveIssue({
          workspaceId,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
        });
        setLiveDataRetry((current) => current + 1);
      }
      setIssues((current) => current.filter((item) => item.id !== issueId));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.issueId === issueId
            ? {
                ...conversation,
                issueId: undefined,
                issueLabel: undefined,
                priority: undefined,
              }
            : conversation,
        ),
      );
      if (inspectorIssueId === issueId) setInspectorIssueId(null);
      if (editIssueId === issueId) setEditIssueId(null);
      setToast(`${issue.identifier} deleted`);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Issue could not be deleted.",
      );
    }
  };

  const resolveIssueAndNotify = async (
    issueId: string,
    message: string,
  ): Promise<boolean> => {
    const issue = issues.find((item) => item.id === issueId);
    const conversation = issue?.conversationId
      ? conversations.find((item) => item.id === issue.conversationId)
      : undefined;
    if (!issue || !conversation || !message.trim()) return false;
    const clientId =
      globalThis.crypto?.randomUUID?.() ?? `resolution-${Date.now()}`;
    try {
      if (!demoMode && workspaceId) {
        await updateLiveIssue({
          workspaceId,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          patch: { status: "Done" },
        });
        await sendLiveMessage({
          workspaceId,
          conversationId: conversation.id,
          text: message.trim(),
          idempotencyKey: clientId,
        });
        await resolveLiveConversation({
          workspaceId,
          conversationId: conversation.id,
        });
        setLiveDataRetry((current) => current + 1);
      } else {
        const outbound: Message = {
          id: `message-${clientId}`,
          clientId,
          conversationId: conversation.id,
          direction: "outbound",
          sender: operatorIdentity.name,
          text: message.trim(),
          time: "now",
          type: "text",
          status: "sent",
        };
        setIssues((current) =>
          current.map((item) =>
            item.id === issue.id
              ? { ...item, status: "Done", updatedAt: "Just now" }
              : item,
          ),
        );
        setConversations((current) =>
          current.map((item) =>
            item.id === conversation.id
              ? {
                  ...item,
                  status: "resolved",
                  attention: "none",
                  messages: [...item.messages, outbound],
                  lastMessage: outbound.text,
                  lastTime: "now",
                  lastMessageAt: new Date().toISOString(),
                }
              : item,
          ),
        );
      }
      setToast(`${issue.identifier} resolved and customer notified`);
      return true;
    } catch (error) {
      setToast(
        error instanceof Error
          ? `Resolution incomplete: ${error.message}`
          : "Issue could not be resolved and notified.",
      );
      setLiveDataRetry((current) => current + 1);
      return false;
    }
  };

  const startRun = (
    issueId: string,
    mode: CodingRun["mode"],
    options?: { repositoryId?: string; instructions?: string },
  ) => {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) return;
    if (!demoMode && workspaceId) {
      void startLiveCodexRun({
        workspaceId,
        issueId,
        issueIdentifier: issue.identifier,
        mode,
        ...options,
      })
        .then(() => {
          setRunDialogIssueId(null);
          setLiveDataRetry((current) => current + 1);
          setToast(`Codex run queued for ${issue.identifier}`);
        })
        .catch((error) =>
          setToast(
            error instanceof Error
              ? error.message
              : "Codex run could not be queued.",
          ),
        );
      return;
    }
    const run: CodingRun = {
      id: `run-${Date.now()}`,
      issueId,
      issueIdentifier: issue.identifier,
      mode,
      status: "Running",
      progress: 8,
      startedAt: "Just now",
      duration: "00:00",
      summary:
        "Preparing an isolated workspace and assembling the issue context.",
      files: [],
      events: [
        {
          id: `event-${Date.now()}`,
          label: "run_started",
          detail: "Run queued with a clean repository context",
          time: "Just now",
          tone: "accent",
        },
      ],
    };
    setRuns((current) => [run, ...current]);
    updateIssue(issueId, {
      codexRuns: issue.codexRuns + 1,
      status: issue.status === "Triage" ? "In Progress" : issue.status,
    });
    setRunDialogIssueId(null);
    setToast(`Codex run started for ${issue.identifier}`);
  };

  const updateRun = (
    runId: string,
    action: "cancel" | "approve" | "reject",
  ) => {
    if (!demoMode && workspaceId) {
      void updateLiveCodexRun({ workspaceId, runId, action })
        .then(() => setLiveDataRetry((current) => current + 1))
        .catch((error) =>
          setToast(
            error instanceof Error
              ? error.message
              : "Codex run could not be updated.",
          ),
        );
    }
    const nextStatus: CodingRun["status"] =
      action === "cancel"
        ? "Canceled"
        : action === "approve"
          ? "Approved"
          : "Rejected";
    setRuns((current) =>
      current.map((run) =>
        run.id === runId
          ? {
              ...run,
              status: nextStatus,
              progress: action === "approve" ? 100 : run.progress,
            }
          : run,
      ),
    );
    setToast(
      action === "cancel"
        ? "Codex run canceled"
        : action === "approve"
          ? "Codex result approved"
          : "Codex result rejected",
    );
  };

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        onOpenCommand={() => setCommandOpen(true)}
        workspaceName={workspaceName}
        channel={channel}
        demoMode={demoMode}
        operator={operatorIdentity}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        onSignOut={() => {
          if (demoMode) {
            setToast("Demo mode has no signed-in session");
            return;
          }
          void supabase?.auth.signOut().then(() => window.location.reload());
        }}
      />
      <main className="main-shell">
        <MobileTopbar
          operator={operatorIdentity}
          onOpenCommand={() => setCommandOpen(true)}
        />
        {liveDataError && (
          <div className="live-data-error">
            <ErrorState
              title="Live data unavailable"
              description={`${liveDataError} No demo records are being shown.`}
              onRetry={() => setLiveDataRetry((current) => current + 1)}
            />
          </div>
        )}
        <ErrorBoundary>
          {!demoMode &&
          !localOperatorMode &&
          !workspaceLoading &&
          !workspaceId ? (
            <WorkspaceOnboarding
              onCreated={(workspace) => {
                setWorkspaceId(workspace.id);
                setWorkspaceName(workspace.name);
                setWorkspaceOptions((current) => [
                  ...current.filter((item) => item.id !== workspace.id),
                  { id: workspace.id, name: workspace.name },
                ]);
                setLiveDataRetry((current) => current + 1);
              }}
            />
          ) : (
            <Routes>
              <Route
                path="/inbox"
                element={
                  <InboxPage
                    workspaceId={workspaceId}
                    conversations={conversations}
                    setConversations={setConversations}
                    selectedConversationId={selectedConversationId}
                    setSelectedConversationId={setSelectedConversationId}
                    issues={issues}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onToast={setToast}
                    liveMode={!demoMode}
                    whatsappConnected={channel?.state === "open"}
                    knowledgeArticles={knowledgeArticles}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                  />
                }
              />
              <Route
                path="/issues"
                element={
                  <IssuesPage
                    issues={issues}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onEditIssue={setEditIssueId}
                    onDeleteIssue={(issueId) => void deleteIssue(issueId)}
                  />
                }
              />
              <Route
                path="/issues/:identifier"
                element={
                  <IssueDetailPage
                    issues={issues}
                    runs={runs}
                    workspaceId={workspaceId}
                    liveMode={!demoMode}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                    onToast={setToast}
                    onOpenIssue={setInspectorIssueId}
                    onOpenConversation={(conversationId) => {
                      setSelectedConversationId(conversationId);
                      window.history.pushState(
                        {},
                        "",
                        `/inbox?conversation=${encodeURIComponent(conversationId)}`,
                      );
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    onStartRun={setRunDialogIssueId}
                    onUpdateIssue={updateIssue}
                    onResolveAndNotify={resolveIssueAndNotify}
                  />
                }
              />
              <Route
                path="/codex-runs"
                element={
                  <RunsPage
                    runs={runs}
                    onOpenIssue={setInspectorIssueId}
                    onStartRun={setRunDialogIssueId}
                    onUpdateRun={updateRun}
                    onRefresh={() => setLiveDataRetry((current) => current + 1)}
                  />
                }
              />
              <Route
                path="/knowledge"
                element={
                  demoMode ? (
                    <KnowledgePage />
                  ) : (
                    <KnowledgeWorkspacePage
                      workspaceId={workspaceId}
                      onToast={setToast}
                    />
                  )
                }
              />
              <Route
                path="/settings"
                element={
                  <LiveSettingsPage
                    workspaceId={workspaceId}
                    onToast={setToast}
                    onChannelChange={setChannel}
                  />
                }
              />
              <Route
                path="/profile"
                element={
                  <ProfileWorkspacePage
                    workspaceId={workspaceId}
                    onToast={setToast}
                    onWorkspaceUpdated={handleProfileWorkspaceUpdated}
                    onIdentityUpdated={handleProfileIdentityUpdated}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <InboxPage
                    workspaceId={workspaceId}
                    conversations={conversations}
                    setConversations={setConversations}
                    selectedConversationId={selectedConversationId}
                    setSelectedConversationId={setSelectedConversationId}
                    issues={issues}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onToast={setToast}
                    liveMode={!demoMode}
                    whatsappConnected={channel?.state === "open"}
                    knowledgeArticles={knowledgeArticles}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                  />
                }
              />
            </Routes>
          )}
        </ErrorBoundary>
      </main>
      <MobileBottomNav />
      {inspectorIssueId && (
        <IssueInspector
          issue={issues.find((item) => item.id === inspectorIssueId)}
          assigneeOptions={assigneeOptions}
          assigneeLabel={assigneeLabel}
          onClose={() => setInspectorIssueId(null)}
          onOpenFull={(identifier) => {
            setInspectorIssueId(null);
            window.history.pushState({}, "", `/issues/${identifier}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          onStartRun={setRunDialogIssueId}
          onUpdateIssue={updateIssue}
        />
      )}
      {commandOpen && (
        <CommandPalette
          conversations={conversations}
          issues={issues}
          workspaces={workspaceOptions}
          currentWorkspaceId={workspaceId ?? (demoMode ? "demo" : "")}
          onClose={() => setCommandOpen(false)}
          onNewIssue={() => {
            setCommandOpen(false);
            setCreateIssueOpen(true);
          }}
          onOpenConversation={(conversationId) => {
            setSelectedConversationId(conversationId);
            window.history.pushState(
              {},
              "",
              `/inbox?conversation=${encodeURIComponent(conversationId)}`,
            );
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          onOpenIssue={(identifier) => {
            window.history.pushState({}, "", `/issues/${identifier}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          onStartRun={setRunDialogIssueId}
          onSwitchWorkspace={(nextWorkspaceId) => {
            const workspace = workspaceOptions.find(
              (item) => item.id === nextWorkspaceId,
            );
            if (!workspace || nextWorkspaceId === "demo") return;
            setWorkspaceId(workspace.id);
            setWorkspaceName(workspace.name);
            setSelectedConversationId("");
            setToast(`Switched to ${workspace.name}`);
          }}
        />
      )}
      {createIssueOpen && (
        <CreateIssueDialog
          conversations={conversations}
          onClose={() => setCreateIssueOpen(false)}
          onCreate={createIssue}
        />
      )}
      {editIssueId && (
        <EditIssueDialog
          issue={issues.find((item) => item.id === editIssueId)}
          onClose={() => setEditIssueId(null)}
          onSave={(patch) => {
            updateIssue(editIssueId, patch);
            setEditIssueId(null);
          }}
        />
      )}
      {runDialogIssueId && (
        <RunCodexDialog
          issue={issues.find((item) => item.id === runDialogIssueId)}
          workspaceId={workspaceId}
          liveMode={!demoMode}
          onClose={() => setRunDialogIssueId(null)}
          onStart={startRun}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

function WorkspaceOnboarding({
  onCreated,
}: {
  onCreated: (workspace: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [prefix, setPrefix] = useState("MEND");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const workspace = await createWorkspace(
        {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          issuePrefix: prefix.trim().toUpperCase() || "MEND",
          timezone: "America/Sao_Paulo",
          defaultLanguage: "pt-BR",
        },
        supabase ?? undefined,
      );
      onCreated(workspace);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create the workspace.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page onboarding-page">
      <div className="onboarding-card">
        <div className="brand-mark">
          <span />
        </div>
        <span className="page-kicker">First workspace</span>
        <h1>Set up Mend for your team</h1>
        <p>
          Create the workspace where your WhatsApp connection, knowledge
          articles, issues and Codex runs will live.
        </p>
        <label>
          Workspace name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Techne"
          />
        </label>
        <label>
          Workspace slug
          <input
            value={slug}
            onChange={(event) =>
              setSlug(event.target.value.replace(/[^a-z0-9-]/g, "-"))
            }
            placeholder="techne"
          />
        </label>
        <label>
          Issue prefix
          <input
            value={prefix}
            maxLength={8}
            onChange={(event) =>
              setPrefix(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
            placeholder="MEND"
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          type="button"
          disabled={saving || !name.trim() || !slug.trim()}
          onClick={() => void submit()}
        >
          {saving ? "Creating workspace…" : "Create workspace"}{" "}
          <ArrowUp size={14} />
        </button>
        <small className="onboarding-note">
          Your account becomes the workspace owner. No sample records are
          created.
        </small>
      </div>
    </div>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  onOpenCommand,
  workspaceName,
  channel,
  demoMode,
  operator,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenCommand: () => void;
  workspaceName: string;
  channel: WhatsAppInstance | null;
  demoMode: boolean;
  operator: { name: string; email: string };
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <span />
        </div>
        <div>
          <div className="brand-name">Mend</div>
          <div className="brand-subtitle">support operations</div>
        </div>
        <button
          className="icon-button subtle sidebar-collapse"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <Menu size={16} />
        </button>
      </div>
      <button
        className="workspace-switcher"
        type="button"
        aria-label="Open workspace profile"
        onClick={() => navigate("/profile?tab=workspace")}
      >
        <span className="workspace-dot">
          {workspaceName.slice(0, 1).toUpperCase()}
        </span>
        <span className="workspace-copy">
          <strong>{workspaceName}</strong>
          <small>{demoMode ? "demo mode" : "live workspace"}</small>
        </span>
        <ChevronRight size={14} />
      </button>
      <button className="command-trigger" onClick={onOpenCommand}>
        <Search size={15} />
        <span>Search everything</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav className="primary-nav" aria-label="Primary navigation">
        <div className="nav-section-label">Workspace</div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={16} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-utilities">
          <button
            className="icon-button subtle"
            type="button"
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            className="icon-button subtle"
            type="button"
            aria-label="Log out"
            onClick={onSignOut}
          >
            <LogOut size={15} />
          </button>
        </div>
        <button
          className="live-connection"
          type="button"
          onClick={() => navigate("/settings")}
        >
          <span
            className={`live-dot ${channel?.state === "open" ? "" : "offline"}`}
          />
          <span>
            <strong>
              {channel?.state === "open"
                ? "WhatsApp connected"
                : "WhatsApp not connected"}
            </strong>
            <small>
              {channel?.instanceName ??
                (demoMode ? "Demo mode" : "Connect a number in Settings")}
            </small>
          </span>
          <SettingsIcon size={15} />
        </button>
        <button
          className="user-row"
          type="button"
          onClick={() => navigate("/profile")}
          aria-label="Open profile"
        >
          <div className="avatar avatar-small avatar-violet">
            {identityInitials(operator.name)}
          </div>
          <span>
            <strong>{operator.name}</strong>
            <small>{operator.email || "Workspace member"}</small>
          </span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}

function MobileTopbar({
  operator,
  onOpenCommand,
}: {
  operator: { name: string; email: string };
  onOpenCommand: () => void;
}) {
  return (
    <header className="mobile-topbar">
      <NavLink className="mobile-brand" to="/inbox" aria-label="Open Inbox">
        <span className="brand-mark">
          <span />
        </span>
        <strong>Mend</strong>
      </NavLink>
      <div className="mobile-topbar-actions">
        <button
          className="mobile-command-button"
          type="button"
          onClick={onOpenCommand}
          aria-label="Search workspace"
        >
          <Search size={17} />
        </button>
        <NavLink
          className="mobile-profile-link"
          to="/profile"
          aria-label="Open profile"
        >
          <span className="avatar avatar-small avatar-violet">
            {identityInitials(operator.name)}
          </span>
        </NavLink>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `mobile-nav-item ${isActive ? "active" : ""}`
          }
        >
          <Icon size={19} strokeWidth={1.8} />
          <span>{label === "Codex runs" ? "Runs" : label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="page-kicker">{eyebrow ?? "Techne workspace"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function InboxPage({
  workspaceId,
  conversations,
  setConversations,
  selectedConversationId,
  setSelectedConversationId,
  issues,
  onOpenIssue,
  onNewIssue,
  onToast,
  liveMode,
  whatsappConnected,
  knowledgeArticles,
  assigneeOptions,
  assigneeLabel,
}: {
  workspaceId: string | null;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  selectedConversationId: string;
  setSelectedConversationId: (id: string) => void;
  issues: Issue[];
  onOpenIssue: (id: string) => void;
  onNewIssue: () => void;
  onToast: (message: string) => void;
  liveMode: boolean;
  whatsappConnected?: boolean;
  knowledgeArticles: KnowledgeArticle[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All conversations");
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [draftInsertRequest, setDraftInsertRequest] = useState<{
    text: string;
    requestId: number;
    conversationId: string;
  }>();
  const [aiDetailsOpen, setAiDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected =
    conversations.find((item) => item.id === selectedConversationId) ??
    conversations[0];
  const messageCanvasRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageSignatureRef = useRef<string | undefined>(undefined);
  const isAtMessageBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messageSignature = selected?.messages
    .map((message) => message.id)
    .join("|");

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const canvas = messageCanvasRef.current;
      if (!canvas) return;
      const scroll = () => {
        if (typeof canvas.scrollTo === "function")
          canvas.scrollTo({ top: canvas.scrollHeight, behavior });
        else canvas.scrollTop = canvas.scrollHeight;
        isAtMessageBottomRef.current = true;
        setShowScrollDown(false);
      };
      if (typeof window !== "undefined" && window.requestAnimationFrame)
        window.requestAnimationFrame(scroll);
      else scroll();
    },
    [],
  );

  useEffect(() => {
    const canvas = messageCanvasRef.current;
    if (!canvas) return;
    const updateBottomState = () => {
      const atBottom =
        canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight <= 48;
      isAtMessageBottomRef.current = atBottom;
      if (atBottom) setShowScrollDown(false);
    };
    updateBottomState();
    canvas.addEventListener("scroll", updateBottomState, { passive: true });
    return () => canvas.removeEventListener("scroll", updateBottomState);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const conversationChanged =
      previousConversationIdRef.current !== selected.id;
    const messagesChanged =
      previousMessageSignatureRef.current !== messageSignature;
    previousConversationIdRef.current = selected.id;
    previousMessageSignatureRef.current = messageSignature;
    if (!conversationChanged && !messagesChanged) return;

    if (conversationChanged || isAtMessageBottomRef.current)
      scrollMessagesToBottom(conversationChanged ? "auto" : "smooth");
    else if (messagesChanged) setShowScrollDown(true);
  }, [messageSignature, scrollMessagesToBottom, selected]);
  const filtered = useMemo(
    () =>
      conversations.filter((conversation) => {
        const queryMatch = normalizeSearch(
          `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
        ).includes(normalizeSearch(search));
        const filterMatch =
          filter === "All conversations" ||
          (filter === "Needs attention" &&
            conversation.attention === "needs_attention") ||
          (filter === "AI handling" &&
            conversation.attention === "ai_handling") ||
          (filter === "Waiting customer" &&
            conversation.attention === "waiting_customer") ||
          (filter === "Unassigned" && conversation.assignee === "Unassigned") ||
          (filter === "Resolved" && conversation.status === "resolved");
        return queryMatch && filterMatch;
      }),
    [conversations, filter, search],
  );

  useEffect(() => {
    const conversationId = new URLSearchParams(location.search).get(
      "conversation",
    );
    if (!conversationId) return;
    if (
      !conversations.some((conversation) => conversation.id === conversationId)
    )
      return;
    setSelectedConversationId(conversationId);
    setMobileConversationOpen(true);
  }, [conversations, location.search, setSelectedConversationId]);

  if (!selected) {
    return (
      <div className="inbox-page">
        <EmptyState
          title="No conversations yet"
          description="New WhatsApp conversations will appear here when the connection is active."
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={onNewIssue}
            >
              <Plus size={14} /> Create an internal issue
            </button>
          }
        />
      </div>
    );
  }

  const activeIssue = selected.issueId
    ? issues.find((issue) => issue.id === selected.issueId)
    : undefined;
  const filterItems = [
    "All conversations",
    "Needs attention",
    "AI handling",
    "Waiting customer",
    "Unassigned",
    "Resolved",
  ];
  const countForFilter = (item: string) =>
    item === "All conversations"
      ? conversations.length
      : conversations.filter(
          (conversation) =>
            (item === "Needs attention" &&
              conversation.attention === "needs_attention") ||
            (item === "AI handling" &&
              conversation.attention === "ai_handling") ||
            (item === "Waiting customer" &&
              conversation.attention === "waiting_customer") ||
            (item === "Unassigned" && conversation.assignee === "Unassigned") ||
            (item === "Resolved" && conversation.status === "resolved"),
        ).length;

  const selectConversation = (conversation: Conversation) => {
    setSelectedConversationId(conversation.id);
    setMobileConversationOpen(true);
    setAiDetailsOpen(false);
    if (conversation.unread)
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id ? { ...item, unread: 0 } : item,
        ),
      );
    if (liveMode && workspaceId && conversation.unread)
      void markLiveConversationRead({
        workspaceId,
        conversationId: conversation.id,
      }).catch((error) =>
        onToast(
          error instanceof Error
            ? error.message
            : "Could not mark conversation as read.",
        ),
      );
  };

  const sendMessage = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    const conversationId = selected.id;
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: Message = {
      id: `temp:${clientId}`,
      clientId,
      conversationId,
      direction: "outbound",
      sender: "You",
      text: text.trim(),
      time: "now",
      type: "text",
      status: "sending",
    };
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [...item.messages, optimistic],
                lastMessage: optimistic.text,
                lastTime: "now",
                lastMessageAt: new Date().toISOString(),
                attention: "waiting_customer",
                unread: 0,
              }
            : item,
        ),
      ),
    );
    if (liveMode && workspaceId) {
      try {
        await sendLiveMessage({
          workspaceId,
          conversationId,
          text: text.trim(),
          idempotencyKey: clientId,
        });
        const snapshot = await loadLiveConversationSnapshot(
          supabase,
          workspaceId,
          conversationId,
        );
        if (snapshot)
          setConversations((current) =>
            mergeConversationSnapshot(current, snapshot),
          );
        onToast(
          selected.aiMode === "safe_auto" &&
            selected.automationState === "ai_active"
            ? "Message sent. AI paused after your reply - choose Resume AI in the three dots menu to continue."
            : "Message accepted by WhatsApp",
        );
        return true;
      } catch (error) {
        setConversations((current) =>
          current.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === optimistic.id
                      ? { ...message, status: "failed" }
                      : message,
                  ),
                }
              : item,
          ),
        );
        onToast(
          error instanceof Error ? error.message : "Message could not be sent.",
        );
        return false;
      }
    }
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              messages: item.messages.map((message) =>
                message.id === optimistic.id
                  ? { ...message, id: `m-${Date.now()}`, status: "sent" }
                  : message,
              ),
            }
          : item,
      ),
    );
    onToast("Message sent");
    return true;
  };

  const sendMedia = async (input: {
    mediaUrl?: string;
    file?: File;
    messageType: "image" | "video" | "audio" | "document";
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }): Promise<boolean> => {
    if (!liveMode || !workspaceId) {
      onToast("Attachments are available only for a live WhatsApp workspace.");
      return false;
    }
    const conversationId = selected.id;
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: Message = {
      id: `temp:${clientId}`,
      clientId,
      conversationId,
      direction: "outbound",
      sender: "You",
      text: input.caption ?? "",
      time: "now",
      type: input.messageType,
      status: "sending",
      attachment: {
        name: input.fileName ?? input.messageType,
        meta: input.mimeType ?? "Attachment",
      },
    };
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [...item.messages, optimistic],
                lastMessage: optimistic.text || "Attachment",
                lastTime: "now",
                lastMessageAt: new Date().toISOString(),
                attention: "waiting_customer",
                unread: 0,
              }
            : item,
        ),
      ),
    );
    try {
      await sendLiveMedia({
        workspaceId,
        conversationId,
        ...input,
        idempotencyKey: clientId,
      });
      const snapshot = await loadLiveConversationSnapshot(
        supabase,
        workspaceId,
        conversationId,
      );
      if (snapshot)
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
      onToast("Attachment accepted by WhatsApp");
      return true;
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === optimistic.id
                    ? { ...message, status: "failed" }
                    : message,
                ),
              }
            : item,
        ),
      );
      onToast(
        error instanceof Error
          ? error.message
          : "Attachment could not be sent.",
      );
      return false;
    }
  };

  const setAiMode = (mode: AiMode) => {
    if (
      mode === "safe_auto" &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable Auto-reply for this conversation? Only allowlisted, high-confidence messages can be sent.",
      )
    )
      return;
    if (liveMode && workspaceId)
      void updateLiveConversation({
        workspaceId,
        conversationId: selected.id,
        updates: { ai_mode: mode },
      }).catch((error) =>
        onToast(
          error instanceof Error
            ? error.message
            : "AI mode could not be saved.",
        ),
      );
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              aiMode: mode,
              attention: mode === "safe_auto" ? "ai_handling" : item.attention,
            }
          : item,
      ),
    );
    onToast(`AI mode: ${mode === "safe_auto" ? "safe auto" : mode}`);
  };

  const setAiPause = async (paused: boolean) => {
    const previous = selected.automationState;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              automationState: paused ? "human_paused" : "ai_active",
              attention: paused ? "needs_attention" : item.attention,
              ...(paused
                ? { humanTakeoverReason: "manual_pause" as const }
                : {}),
            }
          : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (paused)
          await pauseLiveConversationAi({
            workspaceId,
            conversationId: selected.id,
          });
        else
          await resumeLiveConversationAi({
            workspaceId,
            conversationId: selected.id,
          });
      }
      onToast(paused ? "AI paused for this conversation" : "AI resumed");
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id
            ? { ...item, automationState: previous }
            : item,
        ),
      );
      onToast(
        error instanceof Error ? error.message : "AI state could not be saved.",
      );
    }
  };

  const setConversationState = async (status: "snoozed" | "resolved") => {
    const previous = selected;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, status, attention: "none" } : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (status === "snoozed")
          await snoozeLiveConversation({
            workspaceId,
            conversationId: selected.id,
            until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          });
        else
          await resolveLiveConversation({
            workspaceId,
            conversationId: selected.id,
          });
      }
      onToast(
        status === "snoozed"
          ? "Conversation snoozed for 1 hour"
          : "Conversation resolved",
      );
    } catch (error) {
      setConversations((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );
      onToast(
        error instanceof Error
          ? error.message
          : `Conversation could not be ${status}.`,
      );
    }
  };

  const assignConversation = async (assignee: string) => {
    const previous = selected.assignee;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, assignee } : item,
      ),
    );
    try {
      if (liveMode && workspaceId)
        await updateLiveConversation({
          workspaceId,
          conversationId: selected.id,
          updates: {
            assigned_user_id: assignee === "Unassigned" ? null : assignee,
          },
        });
      onToast(`Assigned to ${assigneeLabel(assignee)}`);
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, assignee: previous } : item,
        ),
      );
      onToast(
        error instanceof Error
          ? error.message
          : "Assignment could not be saved.",
      );
    }
  };

  return (
    <div
      className={`inbox-page ${mobileConversationOpen ? "mobile-detail-open" : ""}`}
    >
      <div className="inbox-toolbar">
        <div>
          <div className="page-kicker">
            Live queue <span className="live-dot inline" />
          </div>
          <h1>
            Inbox{" "}
            <span className="title-count">
              {conversations.filter((item) => item.unread > 0).length}
            </span>
          </h1>
        </div>
        <div className="toolbar-actions">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => setFilter("All conversations")}
          >
            <Filter size={15} /> All conversations
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onNewIssue}
          >
            <Plus size={15} /> New issue
          </button>
        </div>
      </div>
      <div
        className={`inbox-layout ${mobileConversationOpen ? "mobile-conversation-open" : ""}`}
      >
        <section className="conversation-rail">
          <div className="rail-heading">
            <span>
              Conversations{" "}
              <span className="count-muted">{filtered.length}</span>
            </span>
            <button
              className="icon-button subtle"
              type="button"
              aria-label="Focus conversation search"
              onClick={() => searchRef.current?.focus()}
            >
              <ListFilter size={16} />
            </button>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              ref={searchRef}
              data-global-search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
            <kbd>/</kbd>
          </label>
          <div
            className="filter-strip"
            role="tablist"
            aria-label="Conversation filters"
          >
            {filterItems.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                className={filter === item ? "selected" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
                <span>{countForFilter(item)}</span>
              </button>
            ))}
          </div>
          <div className="conversation-list">
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selected.id}
                onClick={() => selectConversation(conversation)}
              />
            ))}
            {filtered.length === 0 && (
              <EmptyState
                title="No conversations found"
                description="Try a different search or clear the current filter."
                search={Boolean(search)}
                action={
                  search || filter !== "All conversations" ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setFilter("All conversations");
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
          <div className="rail-footer">
            <span>
              <span className="live-dot" /> WhatsApp
            </span>
            <span>{conversations.length} conversations</span>
          </div>
        </section>
        <section className="conversation-panel">
          <button
            className="mobile-conversation-back"
            type="button"
            onClick={() => setMobileConversationOpen(false)}
          >
            <ArrowLeft size={15} /> Conversations
          </button>
          <ConversationHeader
            conversation={selected}
            onNewIssue={() => {
              if (activeIssue) onOpenIssue(activeIssue.id);
              else onNewIssue();
            }}
            onSetAiMode={setAiMode}
            onSetAiPause={(paused) => void setAiPause(paused)}
            onSnooze={() => void setConversationState("snoozed")}
            onResolve={() => void setConversationState("resolved")}
            onAssign={assignConversation}
            assigneeOptions={assigneeOptions}
            assigneeLabel={assigneeLabel}
            aiDetailsOpen={aiDetailsOpen}
            onToggleAiDetails={() => setAiDetailsOpen((current) => !current)}
          />
          <div
            className={
              "conversation-insights " + (aiDetailsOpen ? "mobile-open" : "")
            }
          >
            <AiDecisionSummary
              conversation={selected}
              onDismiss={() => setAiDetailsOpen(false)}
            />
            {selected.aiDraft && (
              <AiDraftCard
                draft={selected.aiDraft}
                onInsert={(text) =>
                  setDraftInsertRequest({
                    text,
                    requestId: Date.now(),
                    conversationId: selected.id,
                  })
                }
                onDismiss={() => setAiDetailsOpen(false)}
              />
            )}
          </div>
          <div className="message-canvas-shell">
            <div className="message-canvas" ref={messageCanvasRef}>
              <div className="day-divider">
                <span>Today</span>
              </div>
              {selected.messages.length ? (
                selected.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <EmptyState
                  title="No messages yet"
                  description="The first customer message will appear here."
                />
              )}
              {activeIssue && (
                <button
                  className="issue-event"
                  type="button"
                  onClick={() => onOpenIssue(activeIssue.id)}
                >
                  <span className="issue-event-icon">
                    <CircleDot size={14} />
                  </span>
                  <span>
                    <strong>
                      {activeIssue.identifier} · {activeIssue.title}
                    </strong>
                    <small>
                      Issue linked · {activeIssue.status} ·{" "}
                      {activeIssue.priority}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
            {showScrollDown && (
              <button
                className="scroll-down-cta"
                type="button"
                aria-label="Scroll to latest messages"
                onClick={() => scrollMessagesToBottom("smooth")}
              >
                <ChevronDown size={14} /> New messages
              </button>
            )}
          </div>
          <Composer
            onSend={sendMessage}
            onSendMedia={sendMedia}
            aiMode={selected.aiMode}
            automationState={selected.automationState}
            liveMode={liveMode}
            whatsappConnected={whatsappConnected}
            prefillDraft={
              draftInsertRequest?.conversationId === selected.id
                ? draftInsertRequest
                : undefined
            }
            onUseDraft={async () => {
              if (!liveMode)
                return "Entendi o impacto. Vou investigar este caso agora e te atualizo assim que tiver um próximo passo.";
              try {
                const result = await requestAiDraft(
                  selected.messages
                    .map((message) => `${message.sender}: ${message.text}`)
                    .join("\n"),
                  knowledgeArticles
                    .filter((article) => article.status === "Published")
                    .map((article) => `${article.title}\n${article.excerpt}`),
                  workspaceId
                    ? { workspaceId, conversationId: selected.id }
                    : undefined,
                );
                return result.draft;
              } catch (error) {
                onToast(
                  error instanceof Error
                    ? error.message
                    : "AI draft unavailable.",
                );
                return "";
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onClick,
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`conversation-row ${selected ? "selected" : ""}`}
      type="button"
      aria-current={selected ? "true" : undefined}
      aria-label={`Open conversation with ${conversation.name}`}
      onClick={onClick}
    >
      <div
        className="conversation-avatar"
        style={{
          background: `${conversation.accent}18`,
          color: conversation.accent,
        }}
      >
        {conversation.initials}
      </div>
      <div className="conversation-row-main">
        <div className="conversation-row-top">
          <strong>{conversation.name}</strong>
          <span>{conversation.lastTime}</span>
        </div>
        <div className="conversation-preview">{conversation.lastMessage}</div>
        <div className="conversation-row-meta">
          <span>
            {conversation.issueLabel ? (
              <>
                <CircleDot size={11} /> {conversation.issueLabel}
              </>
            ) : (
              conversation.company
            )}
          </span>
          {conversation.priority && (
            <PriorityDot priority={conversation.priority} />
          )}
          {conversation.unread > 0 && (
            <b className="unread-count">{conversation.unread}</b>
          )}
        </div>
      </div>
      <div className={`attention-marker ${conversation.attention}`} />
    </button>
  );
}

function AiDecisionSummary({
  conversation,
  onDismiss,
}: {
  conversation: Conversation;
  onDismiss?: () => void;
}) {
  if (
    !conversation.aiDecision &&
    !conversation.aiIntent &&
    !conversation.aiSummary &&
    conversation.automationState !== "human_paused"
  )
    return null;

  const blocked =
    conversation.automationState !== "human_paused" &&
    conversation.aiDecision === "blocked";
  const title =
    conversation.automationState === "human_paused"
      ? "Human takeover — AI paused"
      : blocked
        ? "AI blocked — needs human"
        : conversation.aiDecision === "auto_reply"
          ? "AI active — auto-reply eligible"
          : "AI active — Copilot";
  return (
    <aside
      className={`ai-decision-card ${blocked ? "blocked" : ""} ${conversation.automationState === "human_paused" ? "paused" : ""}`}
      aria-label="AI decision summary"
    >
      <div className="ai-decision-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> {title}
        </span>
        <span className="ai-decision-heading-actions">
          {conversation.aiConfidence !== undefined && (
            <span className="ai-confidence">
              {Math.round(conversation.aiConfidence * 100)}% confidence
            </span>
          )}
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label="Hide AI details"
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="ai-decision-meta">
        {conversation.aiIntent && (
          <span>Intent: {conversation.aiIntent.replaceAll("_", " ")}</span>
        )}
        {conversation.aiDecisionReason && (
          <span>{conversation.aiDecisionReason}</span>
        )}
      </div>
      {conversation.aiSummary && (
        <p className="ai-decision-summary">{conversation.aiSummary}</p>
      )}
    </aside>
  );
}

function AiDraftCard({
  draft,
  onInsert,
  onDismiss,
}: {
  draft: AiDraft;
  onInsert: (text: string) => void;
  onDismiss?: () => void;
}) {
  return (
    <aside className="ai-draft-card" aria-label="Persisted AI draft">
      <div className="ai-draft-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> AI draft ready
        </span>
        <span className="ai-draft-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => onInsert(draft.body)}
          >
            Insert
          </button>
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label="Hide AI draft"
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      <p className="ai-draft-body">{draft.body}</p>
      {(draft.safetyReason || draft.sources.length > 0) && (
        <div className="ai-draft-meta">
          {draft.safetyReason && <span>{draft.safetyReason}</span>}
          {draft.sources.length > 0 && (
            <span>
              Sources: {draft.sources.map((source) => source.title).join(", ")}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

function ConversationHeader({
  conversation,
  onNewIssue,
  onSetAiMode,
  onSetAiPause,
  onSnooze,
  onResolve,
  onAssign,
  assigneeOptions,
  assigneeLabel,
  aiDetailsOpen,
  onToggleAiDetails,
}: {
  conversation: Conversation;
  onNewIssue: () => void;
  onSetAiMode: (mode: AiMode) => void;
  onSetAiPause: (paused: boolean) => void;
  onSnooze: () => void;
  onResolve: () => void;
  onAssign: (assignee: string) => void;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  aiDetailsOpen: boolean;
  onToggleAiDetails: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="conversation-header">
      <div className="conversation-identity">
        <div
          className="conversation-avatar large"
          style={{
            background: `${conversation.accent}18`,
            color: conversation.accent,
          }}
        >
          {conversation.initials}
        </div>
        <div>
          <div className="identity-name">
            <h2>{conversation.name}</h2>
            <span className="channel-status">
              <span className="live-dot" /> WhatsApp
            </span>
          </div>
          <p>
            {conversation.phone} · {conversation.company}
          </p>
        </div>
      </div>
      <div className="conversation-controls">
        <label className="conversation-assignee conversation-desktop-control">
          <UserRound size={13} aria-hidden="true" />
          <span className="sr-only">Conversation assignee</span>
          <select
            aria-label="Conversation assignee"
            value={conversation.assignee}
            onChange={(event) => onAssign(event.target.value)}
          >
            {assigneeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="conversation-assignee-label">
            {assigneeLabel(conversation.assignee)}
          </span>
        </label>
        <span
          className={`mode-label ${conversation.aiMode} ${conversation.automationState}`}
        >
          <Sparkles size={13} />{" "}
          {conversation.automationState === "human_paused"
            ? "Human takeover — AI paused"
            : conversation.aiMode === "safe_auto"
              ? "Auto-reply"
              : conversation.aiMode === "draft"
                ? "Copilot"
                : "Manual"}
        </span>
        {conversation.humanTakeoverReason && (
          <span className="ai-reason" title="Human takeover reason">
            {conversation.humanTakeoverReason.replaceAll("_", " ")}
          </span>
        )}
        <button
          className="icon-button conversation-desktop-control"
          type="button"
          onClick={onNewIssue}
          aria-label="Open linked issue"
        >
          <CircleDot size={16} />
        </button>
        <div className="menu-wrap">
          <button
            className="icon-button"
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Conversation actions"
          >
            <Ellipsis size={17} />
          </button>
          {menuOpen && (
            <div className="context-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleAiDetails();
                  setMenuOpen(false);
                }}
              >
                <Sparkles size={14} />
                {aiDetailsOpen ? "Hide AI details" : "Show AI details"}
              </button>
              <label className="context-menu-select mobile-menu-control">
                <UserRound size={14} />
                <span>Assignee</span>
                <select
                  aria-label="Conversation assignee"
                  value={conversation.assignee}
                  onChange={(event) => {
                    onAssign(event.target.value);
                    setMenuOpen(false);
                  }}
                >
                  {assigneeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="mobile-menu-control"
                type="button"
                role="menuitem"
                onClick={() => {
                  onNewIssue();
                  setMenuOpen(false);
                }}
              >
                <CircleDot size={14} /> Open linked issue
              </button>
              <hr className="mobile-menu-control" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("draft");
                  setMenuOpen(false);
                }}
              >
                <PenLine size={14} /> Copilot
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("safe_auto");
                  setMenuOpen(false);
                }}
              >
                <Zap size={14} /> Auto-reply
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("off");
                  setMenuOpen(false);
                }}
              >
                <LockKeyhole size={14} /> Manual
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiPause(conversation.automationState !== "human_paused");
                  setMenuOpen(false);
                }}
              >
                {conversation.automationState === "human_paused" ? (
                  <>
                    <Zap size={14} /> Resume AI
                  </>
                ) : (
                  <>
                    <LockKeyhole size={14} /> Pause AI
                  </>
                )}
              </button>
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSnooze();
                  setMenuOpen(false);
                }}
              >
                <Archive size={14} /> Snooze conversation
              </button>
              {conversation.status !== "resolved" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResolve();
                    setMenuOpen(false);
                  }}
                >
                  <Check size={14} /> Resolve conversation
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const attachmentUrl = message.attachment?.url;
  return (
    <div className={`message-row ${message.direction}`}>
      <div className="message-meta">
        {message.direction === "outbound" && message.aiGenerated && (
          <span className="ai-tag">
            <Sparkles size={11} /> AI generated
          </span>
        )}
        {message.sender} · {message.time}
      </div>
      <div className="message-bubble-wrap">
        {message.deleted ? (
          <div className="message-bubble deleted-message">Message deleted</div>
        ) : message.type === "text" ? (
          <div className="message-bubble">{message.text}</div>
        ) : message.type === "image" && attachmentUrl ? (
          <div className="message-bubble media-bubble">
            <img
              src={attachmentUrl}
              alt={message.attachment?.name ?? "WhatsApp image"}
            />
            {message.text && <span>{message.text}</span>}
          </div>
        ) : message.type === "video" && attachmentUrl ? (
          <div className="message-bubble media-bubble">
            <video controls preload="metadata" src={attachmentUrl}>
              <track kind="captions" />
            </video>
            {message.text && <span>{message.text}</span>}
          </div>
        ) : message.type === "audio" && attachmentUrl ? (
          <div className="message-bubble media-bubble">
            <audio controls preload="metadata" src={attachmentUrl} />
            {message.text && <span>{message.text}</span>}
          </div>
        ) : (
          <a
            className="message-bubble attachment-bubble"
            href={attachmentUrl}
            target={attachmentUrl ? "_blank" : undefined}
            rel={attachmentUrl ? "noreferrer" : undefined}
            aria-disabled={!attachmentUrl}
          >
            <FileText size={18} />
            <span>
              <strong>{message.attachment?.name ?? "Attachment"}</strong>
              <small>{message.attachment?.meta ?? "File"}</small>
            </span>
          </a>
        )}
      </div>
      {message.direction === "outbound" && (
        <span
          className={`delivery-status ${message.status === "failed" ? "failed" : ""}`}
          aria-label={message.status ?? "sent"}
        >
          {message.status === "sending" ? (
            "Sending…"
          ) : message.status === "failed" ? (
            "Failed"
          ) : message.status === "read" || message.status === "delivered" ? (
            <CheckCheck size={13} />
          ) : (
            <Check size={13} />
          )}
        </span>
      )}
    </div>
  );
}

function Composer({
  onSend,
  onSendMedia,
  onUseDraft,
  prefillDraft,
  aiMode,
  liveMode,
  whatsappConnected,
  automationState,
}: {
  onSend: (message: string) => boolean | Promise<boolean>;
  onSendMedia?: (input: {
    mediaUrl?: string;
    file?: File;
    messageType: "image" | "video" | "audio" | "document";
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }) => boolean | Promise<boolean>;
  onUseDraft: () => string | Promise<string>;
  prefillDraft?: { text: string; requestId: number };
  aiMode: AiMode;
  liveMode: boolean;
  whatsappConnected?: boolean;
  automationState: AutomationState;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<
    "image" | "video" | "audio" | "document"
  >("document");
  const [fileName, setFileName] = useState("");
  const [caption, setCaption] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!prefillDraft) return;
    setText(prefillDraft.text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefillDraft]);
  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      if (await onSend(text)) {
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  };
  const submitAttachment = async () => {
    const cleanUrl = mediaUrl.trim();
    if (
      !onSendMedia ||
      (!selectedFile && !/^https:\/\/[^\s]+$/i.test(cleanUrl)) ||
      sending
    )
      return;
    setSending(true);
    try {
      if (
        await onSendMedia({
          mediaUrl: selectedFile ? undefined : cleanUrl,
          file: selectedFile ?? undefined,
          messageType: mediaType,
          mimeType: selectedFile?.type || undefined,
          fileName: fileName.trim() || selectedFile?.name || undefined,
          caption: caption.trim() || undefined,
        })
      ) {
        setMediaUrl("");
        setSelectedFile(null);
        setFileName("");
        setCaption("");
        setAttachmentOpen(false);
      }
    } finally {
      setSending(false);
    }
  };
  const connectionLabel = whatsappConnected
    ? "Connected to Whatsmiau"
    : liveMode
      ? "WhatsApp not connected"
      : "Demo workspace";
  return (
    <div className="composer">
      <div className="composer-toolbar">
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMedia || sending}
          aria-label="Attach media"
          aria-expanded={attachmentOpen}
          onClick={() => setAttachmentOpen((current) => !current)}
        >
          <Paperclip size={15} /> Attach
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={sending}
          aria-label="Insert AI draft"
          onClick={() => void Promise.resolve(onUseDraft()).then(setText)}
        >
          <Sparkles size={15} /> Insert AI draft
        </button>
        <span className="composer-hint">
          Enter to send · Shift + Enter for newline
        </span>
      </div>
      {attachmentOpen && (
        <div className="attachment-panel" aria-label="Send an attachment">
          <div className="attachment-panel-header">
            <div>
              <strong>Send media through WhatsApp</strong>
              <p>
                Choose a local file up to 8 MB or provide a public HTTPS URL.
              </p>
            </div>
            <button
              className="icon-button subtle"
              type="button"
              aria-label="Close attachment panel"
              onClick={() => setAttachmentOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="attachment-form-grid">
            <label className="attachment-file-field">
              Local file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/opus,application/pdf,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  if (!file) return;
                  setFileName(file.name);
                  setMediaUrl("");
                  if (file.type.startsWith("image/")) setMediaType("image");
                  else if (file.type.startsWith("video/"))
                    setMediaType("video");
                  else if (file.type.startsWith("audio/"))
                    setMediaType("audio");
                  else setMediaType("document");
                }}
              />
              {selectedFile && (
                <span>
                  {selectedFile.name} ·{" "}
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </label>
            <span className="attachment-or">or</span>
            <label>
              Type
              <select
                value={mediaType}
                onChange={(event) =>
                  setMediaType(event.target.value as typeof mediaType)
                }
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="document">Document</option>
              </select>
            </label>
            <label>
              Public HTTPS URL
              <input
                value={mediaUrl}
                disabled={Boolean(selectedFile)}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://cdn.example.com/file.pdf"
                inputMode="url"
              />
            </label>
            <label>
              File name <span className="optional-label">optional</span>
              <input
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="manual.pdf"
              />
            </label>
            <label>
              Caption <span className="optional-label">optional</span>
              <input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="What should the customer see?"
              />
            </label>
          </div>
          {!selectedFile && !mediaUrl.trim() ? (
            <p className="attachment-help">
              Paste a URL reachable by the Mend API. Nothing is sent until you
              confirm.
            </p>
          ) : (
            !selectedFile &&
            !/^https:\/\/[^\s]+$/i.test(mediaUrl.trim()) && (
              <p className="field-error" role="alert">
                Use a valid public HTTPS URL.
              </p>
            )
          )}
          <div className="attachment-actions">
            <button
              className="button button-ghost"
              type="button"
              onClick={() => setAttachmentOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={
                (!selectedFile &&
                  !/^https:\/\/[^\s]+$/i.test(mediaUrl.trim())) ||
                Boolean(selectedFile && selectedFile.size > 8 * 1024 * 1024) ||
                sending
              }
              onClick={() => void submitAttachment()}
            >
              <Send size={14} /> {sending ? "Sending…" : "Send attachment"}
            </button>
          </div>
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          aria-label="Write a reply"
          value={text}
          disabled={sending}
          onChange={(event) => {
            setText(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            automationState === "human_paused"
              ? "AI paused - resume in three dots"
              : aiMode === "safe_auto"
                ? "AI is handling safe replies…"
                : "Write a reply…"
          }
          rows={1}
        />
        <button
          className={`send-button ${!text.trim() || sending ? "disabled" : ""}`}
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void submit()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </div>
      <div className="composer-footer">
        <span
          className={`connection-state ${whatsappConnected ? "" : "offline"}`}
        >
          <span className={`live-dot ${whatsappConnected ? "" : "offline"}`} />{" "}
          {connectionLabel}
        </span>
        <span className="composer-ai-state">
          <Sparkles size={12} />{" "}
          {aiMode === "off"
            ? "Manual"
            : automationState === "human_paused"
              ? "AI paused"
              : aiMode === "safe_auto"
                ? "Auto-reply active"
                : "Copilot drafts ready"}
        </span>
      </div>
    </div>
  );
}

function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 8 });

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
        });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        className="icon-button subtle"
        type="button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Ellipsis size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="context-menu row-actions-menu"
            role="menu"
            style={{ top: position.top, right: position.right }}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

function IssuesPage({
  issues,
  assigneeOptions,
  assigneeLabel,
  onOpenIssue,
  onNewIssue,
  onEditIssue,
  onDeleteIssue,
}: {
  issues: Issue[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onOpenIssue: (id: string) => void;
  onNewIssue: () => void;
  onEditIssue: (id: string) => void;
  onDeleteIssue: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const [typeFilter, setTypeFilter] = useState<IssueType | "All">("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<Issue["source"] | "All">(
    "All",
  );
  const [labelFilter, setLabelFilter] = useState("All");
  const [codexFilter, setCodexFilter] = useState<
    "All" | "With runs" | "Without runs"
  >("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const labelOptions = [
    ...new Set(issues.flatMap((issue) => issue.labels)),
  ].sort();
  const filtered = issues.filter(
    (issue) =>
      normalizeSearch(
        `${issue.identifier} ${issue.title} ${issue.customer ?? ""} ${issue.assignee} ${issue.labels.join(" ")}`,
      ).includes(normalizeSearch(search)) &&
      (statusFilter === "All" || issue.status === statusFilter) &&
      (priorityFilter === "All" || issue.priority === priorityFilter) &&
      (typeFilter === "All" || issue.type === typeFilter) &&
      (assigneeFilter === "All" || issue.assignee === assigneeFilter) &&
      (sourceFilter === "All" || issue.source === sourceFilter) &&
      (labelFilter === "All" || issue.labels.includes(labelFilter)) &&
      (codexFilter === "All" ||
        (codexFilter === "With runs"
          ? issue.codexRuns > 0
          : issue.codexRuns === 0)),
  );
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setPriorityFilter("All");
    setTypeFilter("All");
    setAssigneeFilter("All");
    setSourceFilter("All");
    setLabelFilter("All");
    setCodexFilter("All");
  };
  const openOnKeyboard = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    issueId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenIssue(issueId);
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow={`Work tracker · ${issues.length} issues`}
        title="Issues"
        description="The internal work queue built from conversations and engineering follow-up."
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={onNewIssue}
          >
            <Plus size={15} /> New issue <kbd>C</kbd>
          </button>
        }
      />
      <div className="issue-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            ref={searchRef}
            data-global-search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues"
            aria-label="Search issues"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="select-control">
          <ListFilter size={14} />
          <select
            aria-label="Filter issues by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as IssueStatus | "All")
            }
          >
            <option value="All">All statuses</option>
            {[
              "Triage",
              "Backlog",
              "Todo",
              "In Progress",
              "Review",
              "Done",
              "Canceled",
            ].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <FilterSelect
          label="Filter issues by priority"
          value={priorityFilter}
          onChange={(value) => setPriorityFilter(value as Priority | "All")}
          options={["All", "Urgent", "High", "Medium", "Low", "No priority"]}
        />
        <FilterSelect
          label="Filter issues by type"
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as IssueType | "All")}
          options={[
            "All",
            "Production Bug",
            "Bug",
            "Incident",
            "Feature",
            "Task",
            "Billing",
            "Commercial",
            "Question",
            "Other",
          ]}
        />
        <FilterSelect
          label="Filter issues by assignee"
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          options={[
            { value: "All", label: "All assignees" },
            ...assigneeOptions,
          ]}
        />
        <FilterSelect
          label="Filter issues by source"
          value={sourceFilter}
          onChange={(value) =>
            setSourceFilter(value as Issue["source"] | "All")
          }
          options={["All", "Conversation", "Internal"]}
        />
        <FilterSelect
          label="Filter issues by label"
          value={labelFilter}
          onChange={setLabelFilter}
          options={[{ value: "All", label: "All labels" }, ...labelOptions]}
        />
        <FilterSelect
          label="Filter issues by Codex runs"
          value={codexFilter}
          onChange={(value) => setCodexFilter(value as typeof codexFilter)}
          options={["All", "With runs", "Without runs"]}
        />
        <button
          className="button button-ghost"
          type="button"
          onClick={clearFilters}
        >
          <Filter size={15} /> Clear filters
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Focus issue search"
          onClick={() => searchRef.current?.focus()}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      <div className="issue-table-wrap">
        {filtered.length ? (
          <table className="issue-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Labels</th>
                <th>Customer</th>
                <th>Updated</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => (
                <tr
                  key={issue.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${issue.identifier}: ${issue.title}`}
                  onKeyDown={(event) => openOnKeyboard(event, issue.id)}
                  onClick={() => onOpenIssue(issue.id)}
                >
                  <td>
                    <PriorityDot priority={issue.priority} showLabel />
                  </td>
                  <td>
                    <div className="issue-title-cell">
                      <span className="issue-id">{issue.identifier}</span>
                      <strong>{issue.title}</strong>
                      {issue.codexRuns > 0 && (
                        <span className="codex-mini">
                          <TerminalSquare size={11} /> {issue.codexRuns}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={issue.status} />
                  </td>
                  <td>
                    <div className="assignee-cell">
                      <div className="avatar avatar-mini avatar-neutral">
                        {issue.assignee === "Unassigned"
                          ? "?"
                          : assigneeLabel(issue.assignee)
                              .slice(0, 2)
                              .toUpperCase()}
                      </div>
                      {assigneeLabel(issue.assignee)}
                    </div>
                  </td>
                  <td>
                    <div className="labels-cell">
                      {issue.labels.slice(0, 2).map((label) => (
                        <span key={label} className="label-pill">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="customer-cell">
                    {issue.customer ?? "Internal"}
                  </td>
                  <td className="updated-cell">{issue.updatedAt}</td>
                  <td className="actions-cell">
                    <ActionMenu label={issue.identifier}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onEditIssue(issue.id)}
                      >
                        <PenLine size={14} /> Edit issue
                      </button>
                      <button
                        className="danger"
                        type="button"
                        role="menuitem"
                        onClick={() => onDeleteIssue(issue.id)}
                      >
                        <Trash2 size={14} /> Delete issue
                      </button>
                    </ActionMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={issues.length ? "No matching issues" : "No issues yet"}
            description={
              issues.length
                ? "Try a different query or clear the filter."
                : "Create the first internal work item from a conversation or directly."
            }
            action={
              issues.length ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={onNewIssue}
                >
                  <Plus size={13} /> New issue
                </button>
              )
            }
            search={Boolean(search)}
          />
        )}
      </div>
      <div className="table-footer">
        <span>
          {filtered.length} of {issues.length} issues
        </span>
        <span>
          <Keyboard size={13} /> C create · E edit · A assign · P priority · S
          status
        </span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | AssigneeOption>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="select-control">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel =
            typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          );
        })}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </div>
  );
}

function IssueDetailPage({
  issues,
  runs,
  workspaceId,
  liveMode,
  assigneeOptions,
  assigneeLabel,
  onToast,
  onOpenIssue,
  onOpenConversation,
  onStartRun,
  onUpdateIssue,
  onResolveAndNotify,
}: {
  issues: Issue[];
  runs: CodingRun[];
  workspaceId: string | null;
  liveMode: boolean;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onToast: (message: string) => void;
  onOpenIssue: (id: string) => void;
  onOpenConversation: (id: string) => void;
  onStartRun: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
  onResolveAndNotify: (issueId: string, message: string) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const identifier = location.pathname.split("/").pop();
  const issue =
    issues.find((item) => item.identifier === identifier) ?? issues[0];
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<
    Array<{ id: string; body: string; createdAt: string }>
  >([]);
  const [evidenceItems, setEvidenceItems] = useState<
    Array<{ id: string; label: string; body: string; createdAt: string }>
  >([]);
  const [timelineItems, setTimelineItems] = useState<
    Array<{ id: string; title: string; createdAt: string }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [evidenceLabel, setEvidenceLabel] = useState("Customer evidence");
  const [evidenceBody, setEvidenceBody] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionSaving, setResolutionSaving] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  useEffect(() => {
    if (!liveMode || !workspaceId || !issue?.identifier) {
      setComments([]);
      setEvidenceItems([]);
      setTimelineItems([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    void getLiveIssueHistory({ workspaceId, identifier: issue.identifier })
      .then((history) => {
        if (!active) return;
        const records = (items: unknown[]) =>
          items.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          );
        setComments(
          records(history.comments).map((item, index) => ({
            id: String(item.id ?? `comment-${index}`),
            body: String(item.body ?? ""),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
        setEvidenceItems(
          records(history.evidence).map((item, index) => ({
            id: String(item.id ?? `evidence-${index}`),
            label: String(item.label ?? item.kind ?? "Evidence"),
            body: String(
              item.textContent ?? item.text_content ?? item.body ?? "",
            ),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
        setTimelineItems(
          records(history.timeline).map((item, index) => ({
            id: String(item.id ?? `timeline-${index}`),
            title: String(
              item.eventType ?? item.event_type ?? "Issue updated",
            ).replaceAll("_", " "),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
      })
      .catch((error) => {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : "Issue history could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [issue?.identifier, liveMode, onToast, workspaceId]);
  if (!issue)
    return (
      <div className="page">
        <EmptyState
          title="Issue not found"
          description="This issue may have been removed or is not available in the current workspace."
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={() => navigate("/issues")}
            >
              <ArrowLeft size={14} /> Back to issues
            </button>
          }
        />
      </div>
    );
  const issueRuns = runs.filter((run) => run.issueId === issue.id);
  const addComment = async () => {
    if (!comment.trim()) return;
    setSavingActivity(true);
    try {
      if (liveMode && workspaceId)
        await createLiveIssueComment(
          {
            workspaceId,
            issueId: issue.id,
            issueIdentifier: issue.identifier,
            body: comment,
          },
          supabase,
        );
      setComments((current) => [
        ...current,
        {
          id: `comment-${Date.now()}`,
          body: comment.trim(),
          createdAt: "Just now",
        },
      ]);
      setComment("");
      onToast("Comment added");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Comment could not be added.",
      );
    } finally {
      setSavingActivity(false);
    }
  };
  const addEvidence = async () => {
    if (!evidenceBody.trim() || !workspaceId) return;
    setSavingActivity(true);
    try {
      await addLiveTextEvidence(
        {
          workspaceId,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          label: evidenceLabel,
          body: evidenceBody,
        },
        supabase,
      );
      setEvidenceItems((current) => [
        ...current,
        {
          id: `evidence-${Date.now()}`,
          label: evidenceLabel.trim() || "Evidence",
          body: evidenceBody.trim(),
          createdAt: "Just now",
        },
      ]);
      setEvidenceBody("");
      onToast("Evidence linked to issue");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Evidence could not be added.",
      );
    } finally {
      setSavingActivity(false);
    }
  };
  const addLabel = () => {
    const label = labelDraft.trim();
    if (!label || issue.labels.includes(label)) return;
    onUpdateIssue(issue.id, { labels: [...issue.labels, label] });
    setLabelDraft("");
  };
  return (
    <div className="page issue-detail-page">
      <button
        className="back-link"
        type="button"
        onClick={() => navigate("/issues")}
      >
        <ArrowLeft size={14} /> Back to issues
      </button>
      <PageHeader
        eyebrow={`${issue.identifier} · ${issue.source.toLowerCase()}`}
        title={issue.title}
        actions={
          <>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => {
                if (issue.status === "Done") {
                  onUpdateIssue(issue.id, { status: "In Progress" });
                  return;
                }
                if (issue.conversationId) {
                  setResolutionMessage(
                    `Olá! O chamado ${issue.identifier} foi resolvido. Se o problema continuar, responda por aqui e reabrimos o atendimento.`,
                  );
                  setResolutionOpen(true);
                  return;
                }
                onUpdateIssue(issue.id, { status: "Done" });
              }}
            >
              {issue.status === "Done"
                ? "Reopen"
                : issue.conversationId
                  ? "Resolve & notify"
                  : "Resolve"}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => onStartRun(issue.id)}
            >
              <TerminalSquare size={15} /> Run Codex
            </button>
          </>
        }
      />
      <div className="issue-detail-grid">
        <div className="issue-main-column">
          <div className="detail-properties">
            <Property label="Status">
              <InlineSelect
                label="Status"
                value={issue.status}
                options={[
                  "Triage",
                  "Backlog",
                  "Todo",
                  "In Progress",
                  "Review",
                  "Done",
                  "Canceled",
                ]}
                renderValue={(value) => (
                  <StatusPill status={value as IssueStatus} />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { status: value as IssueStatus })
                }
              />
            </Property>
            <Property label="Priority">
              <InlineSelect
                label="Priority"
                value={issue.priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"]}
                renderValue={(value) => (
                  <PriorityDot priority={value as Priority} showLabel />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { priority: value as Priority })
                }
              />
            </Property>
            <Property label="Type">
              <InlineSelect
                label="Type"
                value={issue.type}
                options={[
                  "Production Bug",
                  "Bug",
                  "Incident",
                  "Feature",
                  "Task",
                  "Billing",
                  "Commercial",
                  "Question",
                  "Other",
                ]}
                renderValue={(value) => (
                  <span className="plain-value">
                    <CircleDot size={14} /> {value}
                  </span>
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { type: value as IssueType })
                }
              />
            </Property>
            <Property label="Assignee">
              <InlineSelect
                label="Assignee"
                value={issue.assignee}
                options={assigneeOptions}
                renderValue={(value) => (
                  <span className="plain-value">
                    <UserRound size={14} /> {assigneeLabel(value)}
                  </span>
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { assignee: value })
                }
              />
            </Property>
            <Property label="Customer">
              <span className="plain-value">
                <UsersRound size={14} /> {issue.customer ?? "Internal issue"}
              </span>
            </Property>
          </div>
          <section className="detail-section">
            <SectionTitle title="Summary" />
            <InlineText
              label="Issue summary"
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
            <div className="impact-note">
              <Info size={15} />
              <span>
                <strong>Impact</strong>
                <InlineText
                  label="Issue impact"
                  value={issue.impact}
                  onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
                />
              </span>
            </div>
          </section>
          <section className="detail-section">
            <SectionTitle title="Activity" />
            <div className="comment-box">
              <div className="avatar avatar-small avatar-violet">OP</div>
              <div>
                <textarea
                  aria-label="Internal comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Leave an internal comment…"
                />
                <div className="comment-actions">
                  <span>Markdown supported</span>
                  <button
                    className="button button-primary button-small"
                    type="button"
                    disabled={savingActivity || !comment.trim()}
                    onClick={() => void addComment()}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
            <ActivityItem
              icon={<CircleDot size={14} />}
              title={
                issue.source === "Conversation"
                  ? "Issue created from conversation"
                  : "Issue created in workspace"
              }
              detail={`${issue.customer ?? "Internal workspace"} · ${issue.createdAt}`}
            />
            {comments.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<MessageCircle size={14} />}
                title="Internal comment"
                detail={`${item.body} · ${item.createdAt}`}
              />
            ))}
            {timelineItems.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<RefreshCw size={14} />}
                title={item.title}
                detail={item.createdAt}
              />
            ))}
            {historyLoading && <LoadingState label="Loading issue activity…" />}
          </section>
          <section className="detail-section">
            <SectionTitle title="Evidence" />
            <div className="evidence-form">
              <input
                aria-label="Evidence label"
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder="Evidence label"
              />
              <textarea
                aria-label="Evidence text"
                value={evidenceBody}
                onChange={(event) => setEvidenceBody(event.target.value)}
                placeholder="Paste the relevant customer message, log excerpt or reproduction note…"
              />
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={
                  savingActivity || !workspaceId || !evidenceBody.trim()
                }
                onClick={() => void addEvidence()}
              >
                <FileText size={13} /> Add evidence
              </button>
            </div>
            {evidenceItems.length > 0 && (
              <div className="evidence-list">
                {evidenceItems.map((item) => (
                  <div className="evidence-item" key={item.id}>
                    <FileText size={14} />
                    <span>
                      <strong>{item.label}</strong>
                      <p>{item.body}</p>
                      <small>{item.createdAt}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="detail-section">
            <SectionTitle
              title="Codex runs"
              action={issueRuns.length ? "View all" : undefined}
            />
            {issueRuns.length ? (
              issueRuns.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onClick={() => onOpenIssue(issue.id)}
                />
              ))
            ) : (
              <div className="inline-empty">
                <TerminalSquare size={18} />
                <span>No Codex runs yet.</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onStartRun(issue.id)}
                >
                  Start one
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="issue-side-column">
          <div className="side-block">
            <div className="side-block-title">Linked conversation</div>
            {issue.customer && (
              <button
                className="linked-conversation"
                type="button"
                onClick={() =>
                  issue.conversationId &&
                  onOpenConversation(issue.conversationId)
                }
              >
                <div
                  className="conversation-avatar"
                  style={{ background: "#7c91ff18", color: "#9eafff" }}
                >
                  {issue.customer.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{issue.customer}</strong>
                  <small>
                    WhatsApp · {issue.conversationId ? "open" : "internal"}
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="side-block">
            <div className="side-block-title">Labels</div>
            <div className="labels-cloud">
              {issue.labels.length ? (
                issue.labels.map((label) => (
                  <span key={label} className="label-pill large">
                    <Tag size={11} /> {label}
                  </span>
                ))
              ) : (
                <span className="muted-copy">No labels</span>
              )}
            </div>
            <div className="label-editor">
              <input
                aria-label="New issue label"
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLabel();
                }}
                placeholder="Add a label"
              />
              <button
                className="icon-button subtle"
                type="button"
                aria-label="Add issue label"
                onClick={addLabel}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="side-block">
            <div className="side-block-title">Details</div>
            <div className="detail-list">
              <span>
                Created <b>{issue.createdAt}</b>
              </span>
              <span>
                Updated <b>{issue.updatedAt}</b>
              </span>
              <span>
                Source <b>{issue.source}</b>
              </span>
            </div>
          </div>
        </aside>
      </div>
      {resolutionOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setResolutionOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolution-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">Customer update</span>
                <h2 id="resolution-title">Resolve {issue.identifier}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close resolution dialog"
                onClick={() => setResolutionOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Resolution message
                <textarea
                  autoFocus
                  value={resolutionMessage}
                  maxLength={4000}
                  onChange={(event) => setResolutionMessage(event.target.value)}
                />
              </label>
              <div className="modal-note">
                <Send size={14} />
                <span>
                  This sends one WhatsApp message, marks the issue Done and
                  resolves the conversation.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setResolutionOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={resolutionSaving || !resolutionMessage.trim()}
                onClick={() => {
                  setResolutionSaving(true);
                  void onResolveAndNotify(issue.id, resolutionMessage).then(
                    (resolved) => {
                      setResolutionSaving(false);
                      if (resolved) setResolutionOpen(false);
                    },
                  );
                }}
              >
                <Send size={14} />
                {resolutionSaving ? "Sending…" : "Resolve and send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunsPage({
  runs,
  onOpenIssue,
  onStartRun,
  onUpdateRun,
  onRefresh,
}: {
  runs: CodingRun[];
  onOpenIssue: (id: string) => void;
  onStartRun: (id: string) => void;
  onUpdateRun: (runId: string, action: "cancel" | "approve" | "reject") => void;
  onRefresh: () => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  useEffect(
    () => () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    },
    [],
  );
  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), 450);
  };
  if (!selectedRun)
    return (
      <div className="page">
        <PageHeader
          eyebrow="Engineering automation"
          title="Codex runs"
          description="Isolated investigations and local patches, kept inside the workspace."
          actions={
            <button
              className="button button-ghost"
              type="button"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          }
        />
        {refreshing ? (
          <LoadingState label="Refreshing Codex runs…" />
        ) : (
          <EmptyState
            title="No Codex runs yet"
            description="Start a run from an issue when engineering context is ready."
          />
        )}
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Engineering automation"
        title="Codex runs"
        description="Isolated investigations and local patches, kept inside the workspace."
        actions={
          <button
            className="button button-ghost"
            type="button"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {refreshing ? (
        <LoadingState label="Refreshing Codex runs…" />
      ) : (
        <div className="runs-layout">
          <div className="runs-list">
            {runs.map((run) => (
              <button
                className={`run-list-row ${run.id === selectedRun.id ? "selected" : ""}`}
                type="button"
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className={`run-status-dot ${run.status.toLowerCase()}`} />{" "}
                <div>
                  <div className="run-list-heading">
                    <strong>{run.issueIdentifier}</strong>
                    <span>{run.startedAt}</span>
                  </div>
                  <p>
                    {run.mode} · {run.summary}
                  </p>
                  <div className="run-list-meta">
                    <StatusRun status={run.status} />
                    <span>{run.duration}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="run-detail">
            <div className="run-detail-header">
              <div>
                <div className="page-kicker">Selected execution</div>
                <h2>
                  {selectedRun.issueIdentifier}{" "}
                  <span className="muted-separator">·</span> {selectedRun.mode}
                </h2>
                <p>{selectedRun.summary}</p>
              </div>
              <div className="run-detail-actions">
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onOpenIssue(selectedRun.issueId)}
                >
                  Open issue
                </button>
                {selectedRun.status === "Running" && (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "cancel")}
                  >
                    Cancel run
                  </button>
                )}
                {selectedRun.status !== "Running" && (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onStartRun(selectedRun.issueId)}
                  >
                    <RefreshCw size={15} /> Run again
                  </button>
                )}
              </div>
            </div>
            <div
              className="progress-line"
              role="progressbar"
              aria-label={`${selectedRun.issueIdentifier} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={selectedRun.progress}
            >
              <span style={{ width: `${selectedRun.progress}%` }} />
            </div>
            <div className="run-stat-row">
              <span>
                <strong>{selectedRun.progress}%</strong> complete
              </span>
              <span>
                <strong>{selectedRun.files.length}</strong> files changed
              </span>
              <span>
                <strong>{selectedRun.duration}</strong> runtime
              </span>
              {selectedRun.commit && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.commit}</strong>{" "}
                  local commit
                </span>
              )}
              {selectedRun.branch && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.branch}</strong>
                </span>
              )}
            </div>
            {selectedRun.status === "Completed" && (
              <div className="run-review-actions">
                <span>
                  Review the diff and checks before creating a local commit.
                </span>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onUpdateRun(selectedRun.id, "reject")}
                >
                  Reject result
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!selectedRun.diff?.trim()}
                  onClick={() => onUpdateRun(selectedRun.id, "approve")}
                >
                  <Check size={14} /> Approve local commit
                </button>
              </div>
            )}
            <section className="run-section">
              <SectionTitle title="Operational timeline" action="Live" />
              <div className="run-timeline">
                {selectedRun.events.length ? (
                  selectedRun.events.map((event, index) => (
                    <div className="run-event" key={event.id}>
                      <div className={`run-event-node ${event.tone}`}>
                        <span />
                      </div>
                      {index < selectedRun.events.length - 1 && (
                        <div className="run-event-line" />
                      )}
                      <div className="run-event-copy">
                        <div>
                          <strong>{event.detail}</strong>
                          <code>{event.label}</code>
                        </div>
                        <time>{event.time}</time>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No timeline events"
                    description="Events will appear here as the run progresses."
                  />
                )}
              </div>
            </section>
            <section className="run-section">
              <SectionTitle title="Files changed" />
              {selectedRun.files.length ? (
                <div className="file-list">
                  {selectedRun.files.map((file) => (
                    <div className="file-row" key={file}>
                      <FileCode2 size={15} />
                      <span>{file}</span>
                      <span className="file-change">modified</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No patch files"
                  description="This run did not produce a file change."
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle
                title="Reviewable diff"
                action={selectedRun.diffTruncated ? "Truncated" : undefined}
              />
              {selectedRun.diff ? (
                <pre className="diff-view" aria-label="Codex diff">
                  <code>{selectedRun.diff}</code>
                </pre>
              ) : (
                <EmptyState
                  title="No diff available"
                  description="Investigations may finish without changing a file."
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle title="Checks" />
              {selectedRun.checks?.length ? (
                <div className="check-list">
                  {selectedRun.checks.map((check, index) => (
                    <details
                      className={`check-result ${check.exitCode === 0 ? "passed" : "failed"}`}
                      key={`${check.name}-${index}`}
                    >
                      <summary>
                        <span>
                          {check.exitCode === 0 ? (
                            <Check size={14} />
                          ) : (
                            <X size={14} />
                          )}
                        </span>
                        <strong>{check.name}</strong>
                        <code>exit {check.exitCode}</code>
                      </summary>
                      <pre>{check.output || "No command output."}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No checks recorded"
                  description="This run did not execute an approved validation command."
                />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgeSkeletonPreview() {
  return (
    <div
      className="knowledge-list-skeleton"
      role="status"
      aria-label="Loading knowledge"
    >
      {[0, 1, 2].map((item) => (
        <div className="knowledge-skeleton-row" key={item} aria-hidden="true">
          <Skeleton className="knowledge-icon" />
          <div className="knowledge-skeleton-copy">
            <Skeleton className="knowledge-skeleton-title" />
            <Skeleton className="knowledge-skeleton-line" />
            <Skeleton className="knowledge-skeleton-meta" />
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeWorkspacePage({
  workspaceId,
  onToast,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
}) {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    category: string;
    body: string;
    status: "draft" | "published";
  }>({ title: "", category: "Support", body: "", status: "draft" });
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const refresh = useCallback(async () => {
    if (!workspaceId || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await loadLiveWorkspace(supabase, workspaceId);
      setArticles(data.knowledge);
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Knowledge could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [onToast, workspaceId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const filtered = articles.filter((article) =>
    normalizeSearch(
      `${article.title} ${article.category} ${article.excerpt}`,
    ).includes(normalizeSearch(search)),
  );
  const save = async () => {
    if (!workspaceId || !editing.title.trim() || !editing.body.trim()) return;
    try {
      const row = editing.id
        ? await updateLiveKnowledge(
            {
              workspaceId,
              articleId: editing.id,
              patch: {
                title: editing.title.trim(),
                category: editing.category.trim() || "Support",
                body: editing.body.trim(),
                status: editing.status,
              },
            },
            supabase,
          )
        : await createLiveKnowledge(
            {
              workspaceId,
              title: editing.title.trim(),
              category: editing.category.trim() || "Support",
              body: editing.body.trim(),
              status: editing.status,
            },
            supabase,
          );
      const article = toUiKnowledge(row as never);
      setArticles((current) =>
        editing.id
          ? current.map((item) => (item.id === article.id ? article : item))
          : [article, ...current],
      );
      setEditorOpen(false);
      setEditing({ title: "", category: "Support", body: "", status: "draft" });
      onToast(
        editing.id
          ? "Article updated"
          : editing.status === "published"
            ? "Article published for AI"
            : "Article saved as draft",
      );
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Article could not be saved.",
      );
    }
  };
  const remove = async (id: string) => {
    if (!workspaceId) return;
    try {
      await deleteLiveKnowledge({ workspaceId, articleId: id }, supabase);
      setArticles((current) => current.filter((item) => item.id !== id));
      onToast("Article deleted");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Article could not be deleted.",
      );
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Support context"
        title="Knowledge"
        description="Write the trusted articles Mend can use before drafting a WhatsApp reply."
        actions={
          <button
            className="button button-primary"
            type="button"
            disabled={!workspaceId}
            onClick={() => {
              setEditing({
                title: "",
                category: "Support",
                body: "",
                status: "draft",
              });
              setEditorOpen(true);
            }}
          >
            <Plus size={15} /> New article
          </button>
        }
      />
      {!workspaceId && (
        <div className="settings-section">
          <EmptyState
            title="Connect a workspace first"
            description="Knowledge is scoped to an authenticated Mend workspace. No demo articles are shown."
          />
        </div>
      )}
      {workspaceId && (
        <>
          <div className="knowledge-toolbar">
            <label className="search-field">
              <Search size={15} />
              <input
                data-global-search
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your articles"
                aria-label="Search knowledge"
              />
            </label>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div className="knowledge-list">
            {loading ? (
              <KnowledgeSkeletonPreview />
            ) : filtered.length ? (
              filtered.map((article) => (
                <article className="knowledge-row" key={article.id}>
                  <div className="knowledge-icon">
                    <BookOpen size={17} />
                  </div>
                  <div className="knowledge-copy">
                    <div className="knowledge-row-title">
                      <h3>{article.title}</h3>
                      <StatusArticle status={article.status} />
                    </div>
                    <p>{article.excerpt}</p>
                    <div className="knowledge-meta">
                      <span>{article.category}</span>
                      <span>Updated {article.updatedAt}</span>
                    </div>
                  </div>
                  <ActionMenu label={article.title}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEditing({
                          id: article.id,
                          title: article.title,
                          category: article.category,
                          body: article.excerpt,
                          status:
                            article.status === "Published"
                              ? "published"
                              : "draft",
                        });
                        setEditorOpen(true);
                      }}
                    >
                      <PenLine size={14} /> Edit article
                    </button>
                    <button
                      className="danger"
                      type="button"
                      role="menuitem"
                      onClick={() => void remove(article.id)}
                    >
                      <Trash2 size={14} /> Delete article
                    </button>
                  </ActionMenu>
                </article>
              ))
            ) : (
              <EmptyState
                title="No knowledge articles yet"
                description="Create the first reviewed answer about your systems, products and support procedures."
                action={
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={!workspaceId}
                    onClick={() => setEditorOpen(true)}
                  >
                    <Plus size={13} /> New article
                  </button>
                }
              />
            )}
          </div>
          <div className="knowledge-note">
            <ShieldCheck size={15} />
            <span>
              Only published articles from this workspace are eligible for AI
              context. Drafts stay internal.
            </span>
          </div>
        </>
      )}
      {editorOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">Workspace knowledge</span>
                <h2 id="article-editor-title">
                  {editing.id ? "Edit article" : "New article"}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close article editor"
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Title
                <input
                  autoFocus
                  value={editing.title}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="How our checkout works"
                />
              </label>
              <label>
                Category
                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Product"
                />
              </label>
              <label>
                Article body
                <textarea
                  rows={10}
                  value={editing.body}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  placeholder="Explain the system, the correct procedure and when to escalate."
                />
              </label>
              <label>
                Status
                <select
                  value={editing.status}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      status: event.target.value as "draft" | "published",
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published for AI</option>
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  !workspaceId || !editing.title.trim() || !editing.body.trim()
                }
                onClick={() => void save()}
              >
                <Save size={14} /> Save article
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>(seedKnowledge);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const categories = [
    "All",
    ...new Set(articles.map((article) => article.category)),
  ];
  const filtered = articles.filter(
    (article) =>
      normalizeSearch(
        `${article.title} ${article.category} ${article.excerpt}`,
      ).includes(normalizeSearch(search)) &&
      (categoryFilter === "All" || article.category === categoryFilter),
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Support context"
        title="Knowledge"
        description="Small, trusted answers the support agent and AI can use."
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() =>
              setArticles((current) => [
                {
                  id: `kb-${Date.now()}`,
                  title: "Untitled knowledge article",
                  category: "Support",
                  updatedAt: "Just now",
                  excerpt:
                    "Add the operational answer your team wants to reuse.",
                  status: "Draft",
                },
                ...current,
              ])
            }
          >
            <Plus size={15} /> New article
          </button>
        }
      />
      <div className="knowledge-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            ref={searchRef}
            data-global-search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search knowledge"
            aria-label="Search knowledge"
          />
        </label>
        <div className="select-control">
          <ListFilter size={14} />
          <select
            aria-label="Filter knowledge by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "All" ? "All categories" : category}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
      </div>
      <div className="knowledge-list">
        {filtered.length ? (
          filtered.map((article) => (
            <article className="knowledge-row" key={article.id}>
              <div className="knowledge-icon">
                <BookOpen size={17} />
              </div>
              <div className="knowledge-copy">
                <div className="knowledge-row-title">
                  <h3>{article.title}</h3>
                  <StatusArticle status={article.status} />
                </div>
                <p>{article.excerpt}</p>
                <div className="knowledge-meta">
                  <span>{article.category}</span>
                  <span>Updated {article.updatedAt}</span>
                </div>
              </div>
              <ChevronRight size={17} />
            </article>
          ))
        ) : (
          <EmptyState
            title={
              articles.length
                ? "No matching articles"
                : "No knowledge articles yet"
            }
            description={
              articles.length
                ? "Try another search or category."
                : "Create a trusted answer your support team can reuse."
            }
            action={
              articles.length ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter("All");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={() =>
                    setArticles((current) => [
                      {
                        id: `kb-${Date.now()}`,
                        title: "Untitled knowledge article",
                        category: "Support",
                        updatedAt: "Just now",
                        excerpt:
                          "Add the operational answer your team wants to reuse.",
                        status: "Draft",
                      },
                      ...current,
                    ])
                  }
                >
                  <Plus size={13} /> New article
                </button>
              )
            }
            search={Boolean(search)}
          />
        )}
      </div>
      <div className="knowledge-note">
        <ShieldCheck size={15} />
        <span>
          AI only uses published articles from this workspace. Drafts stay
          internal.
        </span>
      </div>
    </div>
  );
}

function LiveSettingsPage({
  workspaceId,
  onToast,
  onChannelChange,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onChannelChange: (channel: WhatsAppInstance | null) => void;
}) {
  return (
    <LiveSettingsWorkspace
      workspaceId={workspaceId}
      onToast={onToast}
      onChannelChange={onChannelChange}
    />
  );
}

function LiveSettingsWorkspace({
  workspaceId,
  onToast,
  onChannelChange,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onChannelChange: (channel: WhatsAppInstance | null) => void;
}) {
  type SettingsTab = "whatsapp" | "members" | "ai" | "repositories" | "audit";
  const [activeTab, setActiveTab] = useState<SettingsTab>("whatsapp");
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selected, setSelected] = useState<WhatsAppInstance | null>(null);
  const [instanceName, setInstanceName] = useState("mend-techne");
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelAction, setChannelAction] = useState(false);
  const [members, setMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [aiPolicy, setAiPolicy] = useState<LiveWorkspaceAiPolicy | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>("draft");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiPolicySaving, setAiPolicySaving] = useState(false);
  const [repositories, setRepositories] = useState<
    Array<{
      id: string;
      name: string;
      localPath: string;
      defaultBranch: string;
    }>
  >([]);
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [repositoryBranch, setRepositoryBranch] = useState("main");

  const refresh = useCallback(async () => {
    setLoading(true);
    setChannelError(null);
    try {
      if (workspaceId && selected?.channelId)
        await refreshLiveChannel({
          workspaceId,
          channelId: selected.channelId,
        });
      const rows = workspaceId
        ? await listLiveChannels(workspaceId)
        : await listWhatsAppInstances();
      const next =
        rows.find((item) => item.instanceName === selected?.instanceName) ??
        rows.find((item) => item.state === "open") ??
        rows[0] ??
        null;
      setInstances(rows);
      setSelected(next);
      onChannelChange(next);
      if (next?.state === "open" || next?.state === "closed") setQr(null);
    } catch (reason) {
      setChannelError(
        reason instanceof Error
          ? reason.message
          : "WhatsApp provider is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    onChannelChange,
    selected?.channelId,
    selected?.instanceName,
    workspaceId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (
      !workspaceId ||
      !selected?.channelId ||
      !["qr-code", "connecting"].includes(selected.state)
    )
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || !selected.channelId) return;
      try {
        const next = await refreshLiveChannel({
          workspaceId,
          channelId: selected.channelId,
        });
        if (stopped) return;
        setSelected((current) =>
          current?.channelId === next.channelId ? next : current,
        );
        setInstances((current) =>
          current.map((item) =>
            item.channelId === next.channelId ? next : item,
          ),
        );
        onChannelChange(next);
        if (next.state === "open") {
          setQr(null);
          onToast("WhatsApp connected");
          return;
        }
        if (next.state === "closed") {
          setQr(null);
          onToast("WhatsApp pairing expired or disconnected.");
          return;
        }
      } catch {
        // Keep polling after transient provider errors.
      }
      if (!stopped) timer = setTimeout(() => void poll(), 3_000);
    };
    timer = setTimeout(() => void poll(), 1_500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    onChannelChange,
    onToast,
    selected?.channelId,
    selected?.state,
    workspaceId,
  ]);

  useEffect(() => {
    let active = true;
    if (!supabase) return undefined;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) {
        setCurrentUserId(data.user.id);
        setCurrentUserEmail(data.user.email ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const loadSettingsData = useCallback(async () => {
    if (
      !workspaceId ||
      activeTab === "whatsapp" ||
      activeTab === "repositories"
    )
      return;
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      if (activeTab === "members")
        setMembers(await listLiveWorkspaceMembers(workspaceId));
      if (activeTab === "audit")
        setAuditLog(await listLiveAuditLog(workspaceId));
      if (activeTab === "ai") {
        const policy = await loadLiveAiConversationPolicy(workspaceId);
        setAiPolicy(policy);
        if (policy.dominantMode !== "mixed") setAiMode(policy.dominantMode);
      }
    } catch (reason) {
      setSettingsError(
        reason instanceof Error
          ? reason.message
          : "Live settings could not be loaded.",
      );
    } finally {
      setSettingsLoading(false);
    }
  }, [activeTab, workspaceId]);

  useEffect(() => {
    void loadSettingsData();
  }, [loadSettingsData]);

  useEffect(() => {
    if (!workspaceId || activeTab !== "repositories") return;
    let active = true;
    void listLiveRepositories(workspaceId)
      .then((rows) => {
        if (active) setRepositories(rows);
      })
      .catch((reason) => {
        if (active)
          onToast(
            reason instanceof Error
              ? reason.message
              : "Repositories could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [activeTab, onToast, workspaceId]);

  const connect = async () => {
    if (!selected) return;
    setChannelAction(true);
    try {
      const result =
        workspaceId && selected.channelId
          ? await connectLiveChannel({
              workspaceId,
              channelId: selected.channelId,
            })
          : await connectWhatsAppInstance({
              instanceName: selected.instanceName,
              workspaceId: "",
            });
      setQr(result.qr ?? null);
      await refresh();
      onToast("Connection request sent");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Could not connect this number.",
      );
    } finally {
      setChannelAction(false);
    }
  };

  const create = async () => {
    if (!instanceName.trim()) return;
    setChannelAction(true);
    try {
      const created = workspaceId
        ? await createLiveChannel({
            workspaceId,
            name: instanceName.trim(),
            instanceName: instanceName.trim(),
          })
        : await createWhatsAppInstance({
            instanceName: instanceName.trim(),
            workspaceId: "",
          });
      setSelected(created);
      setQr(created.qr ?? null);
      await refresh();
      onToast("WhatsApp instance created");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Could not create this instance.",
      );
    } finally {
      setChannelAction(false);
    }
  };

  const disconnect = async () => {
    if (!selected) return;
    setChannelAction(true);
    try {
      if (workspaceId && selected.channelId)
        await disconnectLiveChannel({
          workspaceId,
          channelId: selected.channelId,
        });
      else
        await disconnectWhatsAppInstance({
          instanceName: selected.instanceName,
          workspaceId: "",
        });
      setQr(null);
      await refresh();
      onToast("WhatsApp disconnected");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Could not disconnect this number.",
      );
    } finally {
      setChannelAction(false);
    }
  };

  const loadQr = async () => {
    if (!selected) return;
    try {
      const result =
        workspaceId && selected.channelId
          ? await getLiveChannelQr({
              workspaceId,
              channelId: selected.channelId,
            })
          : await getWhatsAppQr({
              instanceName: selected.instanceName,
              workspaceId: "",
            });
      setQr("qr" in result ? result.qr : result.data);
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : "QR code is not available.",
      );
    }
  };

  const createRepository = async () => {
    if (!workspaceId || !repositoryName.trim() || !repositoryPath.trim())
      return;
    setChannelAction(true);
    try {
      const repository = await createLiveRepository({
        workspaceId,
        name: repositoryName,
        localPath: repositoryPath,
        defaultBranch: repositoryBranch,
      });
      setRepositories((current) => [repository, ...current]);
      setRepositoryName("");
      setRepositoryPath("");
      onToast("Repository configured");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Repository could not be configured.",
      );
    } finally {
      setChannelAction(false);
    }
  };

  const saveAiPolicy = async () => {
    if (!workspaceId || !aiPolicy?.totalConversations) return;
    if (
      aiMode === "safe_auto" &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable Auto-reply for this workspace? It remains blocked unless the explicit send policy is enabled.",
      )
    )
      return;
    setAiSaving(true);
    try {
      const result = await saveLiveConversationAiPolicy(workspaceId, aiMode);
      if (result.updatedCount === 0)
        onToast("No live conversations were updated.");
      else {
        onToast(
          "AI mode saved for " +
            result.updatedCount +
            " live conversation" +
            (result.updatedCount === 1 ? "" : "s"),
        );
        await loadSettingsData();
      }
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "AI behavior could not be saved.",
      );
    } finally {
      setAiSaving(false);
    }
  };

  const saveAutomationPolicy = async () => {
    if (!workspaceId || !aiPolicy) return;
    if (
      aiPolicy.safeAutoSendEnabled &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable automatic customer replies for this workspace? Only configured routes with relevant published knowledge can send.",
      )
    )
      return;
    setAiPolicySaving(true);
    try {
      await saveLiveWorkspaceAiPolicy(workspaceId, aiPolicy);
      onToast("Workspace AI routing saved");
      await loadSettingsData();
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Workspace AI routing could not be saved.",
      );
    } finally {
      setAiPolicySaving(false);
    }
  };

  const updateAutomationRoute = (
    intent: TriageIntent,
    route: AiTriageRoute,
  ) => {
    setAiPolicy((current) =>
      current
        ? { ...current, routes: { ...current.routes, [intent]: route } }
        : current,
    );
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: typeof MessageCircle;
  }> = [
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "members", label: "Members", icon: UsersRound },
    { id: "ai", label: "AI behavior", icon: Bot },
    { id: "repositories", label: "Repositories", icon: GitBranch },
    { id: "audit", label: "Audit log", icon: ShieldCheck },
  ];
  const memberName = (member: WorkspaceMemberRecord) =>
    member.user_id === currentUserId
      ? (currentUserEmail ?? "Current account")
      : "User " + member.user_id.slice(0, 8);
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(date);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Connect the real WhatsApp number and keep people, policies and access history grounded in live data."
      />
      <div className="settings-layout">
        <div
          className="settings-nav"
          role="tablist"
          aria-label="Workspace settings"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={"settings-tab-" + id}
              className={
                "settings-nav-item" + (activeTab === id ? " selected" : "")
              }
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={"settings-panel-" + id}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="settings-content">
          {activeTab === "whatsapp" && (
            <div
              id="settings-panel-whatsapp"
              role="tabpanel"
              aria-labelledby="settings-tab-whatsapp"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>WhatsApp connection</h2>
                    <p>
                      Live state from Whatsmiau. No sample customer or phone is
                      displayed.
                    </p>
                  </div>
                  <span
                    className={
                      "connection-pill " +
                      (selected?.state === "open" ? "connected" : "offline")
                    }
                  >
                    <span className="live-dot" />{" "}
                    {selected?.state === "open" ? "Connected" : "Not connected"}
                  </span>
                </div>
                {channelError && (
                  <div className="inline-empty" role="alert">
                    <Info size={16} />
                    <span>{channelError}</span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void refresh()}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {selected &&
                  ["qr-code", "connecting"].includes(selected.state) && (
                    <div className="inline-empty" role="status">
                      <RefreshCw size={16} />
                      <span>
                        Checking WhatsApp connection… This screen updates
                        automatically after you scan the QR code.
                      </span>
                    </div>
                  )}
                {!loading && !instances.length && (
                  <EmptyState
                    title="No WhatsApp instances"
                    description="Create an instance on the server, then pair your WhatsApp Business number."
                  />
                )}
                {selected && (
                  <div className="connection-card">
                    <div className="connection-card-main">
                      <div className="whatsapp-symbol">◔</div>
                      <div>
                        <strong>{selected.instanceName}</strong>
                        <span>
                          {selected.phoneNumber ?? "Phone not reported"} ·
                          Whatsmiau
                        </span>
                        <small>Provider state: {selected.state}</small>
                      </div>
                    </div>
                    <div className="connection-card-actions">
                      <button
                        className="button button-ghost"
                        type="button"
                        disabled={loading || channelAction}
                        onClick={() => void refresh()}
                      >
                        <RefreshCw size={14} /> Refresh
                      </button>
                      {selected.state === "open" ? (
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={channelAction}
                          onClick={() => void disconnect()}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={channelAction}
                          onClick={() => void connect()}
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {selected && qr && selected.state !== "open" && (
                  <div className="qr-row">
                    <div>
                      <img
                        className="qr-image"
                        src={qr}
                        alt="WhatsApp pairing QR code"
                      />
                      <div>
                        <strong>Scan this QR code</strong>
                        <p>
                          Keep this screen open while WhatsApp Business pairs.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {selected && !qr && selected.state !== "open" && (
                  <div className="qr-row">
                    <div>
                      <div className="qr-placeholder">
                        <QrCode size={34} />
                      </div>
                      <div>
                        <strong>Pair this number</strong>
                        <p>Generate a fresh QR code from the provider.</p>
                      </div>
                    </div>
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={channelAction}
                      onClick={() => void loadQr()}
                    >
                      Generate QR <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </section>
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Pair a new number</h2>
                    <p>
                      Create a server-side Whatsmiau instance without exposing
                      its API key.
                    </p>
                  </div>
                </div>
                <div className="settings-form-grid">
                  <label>
                    Instance name
                    <input
                      value={instanceName}
                      onChange={(event) => setInstanceName(event.target.value)}
                      placeholder="mend-techne"
                    />
                  </label>
                </div>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={channelAction || !instanceName.trim()}
                  onClick={() => void create()}
                >
                  Create instance
                </button>
              </section>
            </div>
          )}

          {activeTab === "members" && (
            <div
              id="settings-panel-members"
              role="tabpanel"
              aria-labelledby="settings-tab-members"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Workspace members</h2>
                    <p>
                      Memberships are read from Supabase with the current
                      session's row-level access.
                    </p>
                  </div>
                  <span className="section-count">
                    {members.length} visible
                  </span>
                </div>
                {settingsError && (
                  <div className="inline-empty" role="alert">
                    <Info size={16} />
                    <span>{settingsError}</span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void loadSettingsData()}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label="Loading workspace members…" />
                ) : !settingsError && members.length === 0 ? (
                  <EmptyState
                    title="No visible members"
                    description="Supabase returned no workspace membership for this session. No sample members are shown."
                  />
                ) : (
                  !settingsError && (
                    <div
                      className="settings-list"
                      aria-label="Live workspace members"
                    >
                      {members.map((member) => (
                        <div className="settings-list-row" key={member.id}>
                          <div className="avatar avatar-mini avatar-violet">
                            {memberName(member).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="settings-list-main">
                            <strong>{memberName(member)}</strong>
                            <span>
                              Member since {formatDate(member.created_at)}
                            </span>
                          </div>
                          <span className="role-pill">{member.role}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>
            </div>
          )}

          {activeTab === "ai" && (
            <div
              id="settings-panel-ai"
              role="tabpanel"
              aria-labelledby="settings-tab-ai"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>AI behavior</h2>
                    <p>
                      Manage the mode stored on live conversations. This control
                      never seeds a policy or pretends to update an empty
                      workspace.
                    </p>
                  </div>
                </div>
                {settingsError && (
                  <div className="inline-empty" role="alert">
                    <Info size={16} />
                    <span>{settingsError}</span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void loadSettingsData()}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label="Loading conversation policy…" />
                ) : !settingsError && aiPolicy ? (
                  <>
                    <div className="policy-row">
                      <div>
                        <strong>Apply mode to current conversations</strong>
                        <p>
                          {aiPolicy.totalConversations} live conversation
                          {aiPolicy.totalConversations === 1 ? "" : "s"} ·{" "}
                          {aiPolicy.counts.off} off · {aiPolicy.counts.draft}{" "}
                          drafts · {aiPolicy.counts.safe_auto} auto-reply
                        </p>
                      </div>
                      <select
                        className="settings-inline-select"
                        aria-label="AI mode for live conversations"
                        value={aiMode}
                        disabled={aiSaving}
                        onChange={(event) =>
                          setAiMode(event.target.value as AiMode)
                        }
                      >
                        <option value="draft">Copilot</option>
                        <option value="safe_auto">Auto-reply</option>
                        <option value="off">Manual</option>
                      </select>
                    </div>
                    <div className="settings-note">
                      <Sparkles size={14} />
                      <span>
                        The mode is per conversation. The routing rules below
                        are workspace-wide and apply to every new inbound
                        message.
                      </span>
                    </div>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={aiSaving || aiMode === aiPolicy.dominantMode}
                      onClick={() => void saveAiPolicy()}
                    >
                      <Save size={14} />{" "}
                      {aiSaving ? "Saving…" : "Save conversation policy"}
                    </button>
                    <div className="settings-section-header settings-subsection-header">
                      <div>
                        <h3>AI triage routing</h3>
                        <p>
                          The company decides what the AI does for each type of
                          situation. A knowledge route without a relevant
                          published article falls back to human escalation.
                        </p>
                      </div>
                    </div>
                    <div className="automation-route-grid">
                      {triageIntentValues.map((intent) => (
                        <label key={intent}>
                          {triageIntentLabels[intent]}
                          <select
                            aria-label={`AI route for ${triageIntentLabels[intent]}`}
                            value={aiPolicy.routes[intent]}
                            disabled={aiPolicySaving}
                            onChange={(event) =>
                              updateAutomationRoute(
                                intent,
                                event.target.value as AiTriageRoute,
                              )
                            }
                          >
                            {aiTriageRouteValues.map((route) => (
                              <option key={route} value={route}>
                                {triageRouteLabels[route]}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <label>
                        Unknown or unmatched fallback
                        <select
                          aria-label="AI fallback route"
                          value={aiPolicy.fallbackRoute}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    fallbackRoute: event.target
                                      .value as AiTriageRoute,
                                  }
                                : current,
                            )
                          }
                        >
                          {aiTriageRouteValues.map((route) => (
                            <option key={route} value={route}>
                              {triageRouteLabels[route]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="settings-form-grid automation-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.requirePublishedKnowledge}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    requirePublishedKnowledge:
                                      event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Require published knowledge for AI answers
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.notifyOnHumanEscalation}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    notifyOnHumanEscalation:
                                      event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Notify the company on human escalation
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.notifyOnBug}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    notifyOnBug: event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Notify the company immediately on bug reports
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.safeAutoSendEnabled}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    safeAutoSendEnabled: event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Allow configured knowledge auto-replies
                      </label>
                    </div>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={aiPolicySaving}
                      onClick={() => void saveAutomationPolicy()}
                    >
                      <Save size={14} /> Save AI triage rules
                    </button>
                  </>
                ) : null}
              </section>
            </div>
          )}

          {activeTab === "repositories" && (
            <div
              id="settings-panel-repositories"
              role="tabpanel"
              aria-labelledby="settings-tab-repositories"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Repositories</h2>
                    <p>
                      Register a local repository before starting a controlled
                      Codex run.
                    </p>
                  </div>
                </div>
                {repositories.map((repository) => (
                  <div className="policy-row" key={repository.id}>
                    <div>
                      <strong>{repository.name}</strong>
                      <p>
                        {repository.localPath} · {repository.defaultBranch}
                      </p>
                    </div>
                    <GitBranch size={15} />
                  </div>
                ))}
                {!repositories.length && (
                  <div className="inline-empty">
                    <GitBranch size={16} />
                    <span>No repositories configured for this workspace.</span>
                  </div>
                )}
                <div className="settings-form-grid">
                  <label>
                    Name
                    <input
                      value={repositoryName}
                      onChange={(event) =>
                        setRepositoryName(event.target.value)
                      }
                      placeholder="Support app"
                    />
                  </label>
                  <label>
                    Local path
                    <input
                      value={repositoryPath}
                      onChange={(event) =>
                        setRepositoryPath(event.target.value)
                      }
                      placeholder="C:\workspace\support-app"
                    />
                  </label>
                  <label>
                    Default branch
                    <input
                      value={repositoryBranch}
                      onChange={(event) =>
                        setRepositoryBranch(event.target.value)
                      }
                      placeholder="main"
                    />
                  </label>
                </div>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    channelAction ||
                    !workspaceId ||
                    !repositoryName.trim() ||
                    !repositoryPath.trim()
                  }
                  onClick={() => void createRepository()}
                >
                  <Plus size={14} /> Add repository
                </button>
              </section>
            </div>
          )}

          {activeTab === "audit" && (
            <div
              id="settings-panel-audit"
              role="tabpanel"
              aria-labelledby="settings-tab-audit"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Audit log</h2>
                    <p>
                      Immutable workspace events returned by the authenticated
                      Supabase session.
                    </p>
                  </div>
                  <span className="section-count">
                    {auditLog.length} events
                  </span>
                </div>
                {settingsError && (
                  <div className="inline-empty" role="alert">
                    <Info size={16} />
                    <span>{settingsError}</span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void loadSettingsData()}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label="Loading audit log…" />
                ) : !settingsError && auditLog.length === 0 ? (
                  <EmptyState
                    title="No audit events yet"
                    description="Actions will appear here after live workspace activity. No sample events are displayed."
                  />
                ) : (
                  !settingsError && (
                    <div className="audit-list" aria-label="Live audit events">
                      {auditLog.map((event) => (
                        <div className="audit-row" key={event.id}>
                          <div className="audit-row-main">
                            <strong>{event.action}</strong>
                            <span>
                              {event.entity_type}
                              {event.entity_id
                                ? " · " + event.entity_id.slice(0, 8)
                                : ""}
                            </span>
                          </div>
                          <div className="audit-row-meta">
                            <span>
                              {event.actor_user_id
                                ? event.actor_user_id.slice(0, 8)
                                : "System"}
                            </span>
                            <time dateTime={event.created_at}>
                              {formatDate(event.created_at)}
                            </time>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueInspector({
  issue,
  assigneeOptions,
  assigneeLabel,
  onClose,
  onOpenFull,
  onStartRun,
  onUpdateIssue,
}: {
  issue?: Issue;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onClose: () => void;
  onOpenFull: (identifier: string) => void;
  onStartRun: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (issue) closeButtonRef.current?.focus();
  }, [issue]);
  if (!issue) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="issue-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-inspector-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inspector-header">
          <div>
            <span className="page-kicker">Issue inspector</span>
            <h2 id="issue-inspector-title">{issue.identifier}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close issue inspector"
          >
            <X size={17} />
          </button>
        </div>
        <div className="inspector-scroll">
          <h3>{issue.title}</h3>
          <div className="inspector-props">
            <InlineSelect
              label="Status"
              value={issue.status}
              options={[
                "Triage",
                "Backlog",
                "Todo",
                "In Progress",
                "Review",
                "Done",
                "Canceled",
              ]}
              renderValue={(value) => (
                <StatusPill status={value as IssueStatus} />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { status: value as IssueStatus })
              }
            />
            <InlineSelect
              label="Priority"
              value={issue.priority}
              options={["Urgent", "High", "Medium", "Low", "No priority"]}
              renderValue={(value) => (
                <PriorityDot priority={value as Priority} showLabel />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { priority: value as Priority })
              }
            />
            <InlineSelect
              label="Assignee"
              value={issue.assignee}
              options={assigneeOptions}
              renderValue={(value) => (
                <span className="plain-value">{assigneeLabel(value)}</span>
              )}
              onChange={(value) => onUpdateIssue(issue.id, { assignee: value })}
            />
            <InlineSelect
              label="Type"
              value={issue.type}
              options={[
                "Production Bug",
                "Bug",
                "Incident",
                "Feature",
                "Task",
                "Billing",
                "Commercial",
                "Question",
                "Other",
              ]}
              renderValue={(value) => (
                <span className="plain-value">{value}</span>
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { type: value as IssueType })
              }
            />
          </div>
          <section className="inspector-section">
            <SectionTitle title="Summary" />
            <InlineText
              label="Issue summary"
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title="Impact" />
            <InlineText
              label="Issue impact"
              value={issue.impact}
              onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title="Activity" />
            <ActivityItem
              icon={<CircleDot size={13} />}
              title="Issue linked to conversation"
              detail={`${issue.customer ?? "Internal"} · ${issue.updatedAt}`}
            />
          </section>
        </div>
        <div className="inspector-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => onOpenFull(issue.identifier)}
          >
            Open full issue <ArrowUp size={14} />
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onStartRun(issue.id)}
          >
            <TerminalSquare size={14} /> Run Codex
          </button>
        </div>
      </aside>
    </div>
  );
}

function CommandPalette({
  conversations,
  issues,
  workspaces,
  currentWorkspaceId,
  onClose,
  onNewIssue,
  onOpenConversation,
  onOpenIssue,
  onStartRun,
  onSwitchWorkspace,
}: {
  conversations: Conversation[];
  issues: Issue[];
  workspaces: Array<{ id: string; name: string }>;
  currentWorkspaceId: string;
  onClose: () => void;
  onNewIssue: () => void;
  onOpenConversation: (id: string) => void;
  onOpenIssue: (identifier: string) => void;
  onStartRun: (issueId: string) => void;
  onSwitchWorkspace: (workspaceId: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const actions = [
    {
      label: "Open inbox",
      hint: "G then I",
      icon: InboxIcon,
      action: () => navigate("/inbox"),
    },
    {
      label: "Browse issues",
      hint: "G then X",
      icon: CircleDot,
      action: () => navigate("/issues"),
    },
    { label: "Create new issue", hint: "C", icon: Plus, action: onNewIssue },
    {
      label: "View Codex runs",
      hint: "G then R",
      icon: TerminalSquare,
      action: () => navigate("/codex-runs"),
    },
    {
      label: "Open knowledge",
      hint: "G then K",
      icon: BookOpen,
      action: () => navigate("/knowledge"),
    },
    {
      label: "Open settings",
      hint: "",
      icon: SettingsIcon,
      action: () => navigate("/settings"),
    },
  ];
  const normalizedQuery = normalizeSearch(query);
  const entityActions = normalizedQuery
    ? [
        ...conversations
          .filter((conversation) =>
            normalizeSearch(
              `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
            ).includes(normalizedQuery),
          )
          .slice(0, 6)
          .map((conversation) => ({
            label: `Conversation: ${conversation.name}`,
            hint: "WhatsApp",
            icon: MessageCircle,
            action: () => onOpenConversation(conversation.id),
          })),
        ...issues
          .filter((issue) =>
            normalizeSearch(
              `${issue.identifier} ${issue.title} ${issue.customer ?? ""} ${issue.labels.join(" ")}`,
            ).includes(normalizedQuery),
          )
          .slice(0, 6)
          .flatMap((issue) => [
            {
              label: `${issue.identifier}: ${issue.title}`,
              hint: "Issue",
              icon: CircleDot,
              action: () => onOpenIssue(issue.identifier),
            },
            ...(normalizedQuery.includes("codex") ||
            normalizedQuery.includes("run")
              ? [
                  {
                    label: `Run Codex for ${issue.identifier}`,
                    hint: "Start",
                    icon: TerminalSquare,
                    action: () => onStartRun(issue.id),
                  },
                ]
              : []),
          ]),
        ...workspaces
          .filter(
            (workspace) =>
              workspace.id !== currentWorkspaceId &&
              normalizeSearch(`switch workspace ${workspace.name}`).includes(
                normalizedQuery,
              ),
          )
          .slice(0, 4)
          .map((workspace) => ({
            label: `Switch workspace: ${workspace.name}`,
            hint: "Workspace",
            icon: UsersRound,
            action: () => onSwitchWorkspace(workspace.id),
          })),
      ]
    : [];
  const filteredActions = [
    ...actions.filter((action) =>
      normalizeSearch(action.label).includes(normalizedQuery),
    ),
    ...entityActions,
  ];
  const selectFirst = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredActions[0]) {
      filteredActions[0].action();
      onClose();
    }
  };
  return (
    <div className="palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={17} />
          <input
            id="command-palette-title"
            autoFocus
            aria-label="Search actions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={selectFirst}
            placeholder="Search actions or jump to…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-group">
          <span className="palette-label">
            {normalizedQuery
              ? "Actions and workspace results"
              : "Quick actions"}
          </span>
          {filteredActions.length ? (
            filteredActions.map(({ label, hint, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  action();
                  onClose();
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                <kbd>{hint}</kbd>
              </button>
            ))
          ) : (
            <EmptyState
              title="No matching actions"
              description="Try a different command."
              search
            />
          )}
        </div>
        <div className="palette-footer">
          <span>
            <Command size={13} /> Navigate
          </span>
          <span>
            <CornerDownRight size={13} /> Select
          </span>
          <span>
            <Keyboard size={13} /> Shortcuts
          </span>
        </div>
      </div>
    </div>
  );
}

function CreateIssueDialog({
  conversations,
  onClose,
  onCreate,
}: {
  conversations: Conversation[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    type: IssueType;
    priority: Priority;
    conversationId?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("Task");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add a short title so the team knows what needs attention.");
      return;
    }
    onCreate({
      title: cleanTitle,
      type,
      priority,
      conversationId: conversationId || undefined,
    });
  };
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-issue-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">New work item</span>
            <h2 id="create-issue-title">Create issue</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close create issue dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={240}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "create-issue-error" : undefined}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
              placeholder="What needs to be done?"
            />
            {error && (
              <span className="field-error" id="create-issue-error">
                {error}
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as IssueType)}
              >
                {[
                  "Production Bug",
                  "Bug",
                  "Incident",
                  "Feature",
                  "Task",
                  "Billing",
                  "Commercial",
                  "Question",
                  "Other",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Priority)
                }
              >
                {["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label>
            Link conversation{" "}
            <select
              value={conversationId}
              onChange={(event) => setConversationId(event.target.value)}
            >
              <option value="">Internal issue</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.name} · {conversation.lastMessage.slice(0, 42)}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-note">
            <Info size={14} />
            <span>
              Issues stay inside Techne. No external ticket tracker is
              connected.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            Create issue
          </button>
        </div>
      </div>
    </div>
  );
}

function EditIssueDialog({
  issue,
  onClose,
  onSave,
}: {
  issue?: Issue;
  onClose: () => void;
  onSave: (
    patch: Pick<Issue, "title" | "type" | "priority" | "status">,
  ) => void;
}) {
  const [title, setTitle] = useState(issue?.title ?? "");
  const [type, setType] = useState<IssueType>(issue?.type ?? "Task");
  const [priority, setPriority] = useState<Priority>(
    issue?.priority ?? "Medium",
  );
  const [status, setStatus] = useState<IssueStatus>(issue?.status ?? "Triage");
  const [error, setError] = useState("");
  if (!issue) return null;

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add a short title so the issue remains actionable.");
      return;
    }
    onSave({ title: cleanTitle, type, priority, status });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-issue-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">{issue.identifier}</span>
            <h2 id="edit-issue-title">Edit issue</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close edit issue dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={240}
              aria-invalid={Boolean(error)}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
            />
            {error && <span className="field-error">{error}</span>}
          </label>
          <div className="form-row">
            <label>
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as IssueType)}
              >
                {[
                  "Production Bug",
                  "Bug",
                  "Incident",
                  "Feature",
                  "Task",
                  "Billing",
                  "Commercial",
                  "Question",
                  "Other",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Priority)
                }
              >
                {["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as IssueStatus)}
            >
              {[
                "Triage",
                "Backlog",
                "Todo",
                "In Progress",
                "Review",
                "Done",
                "Canceled",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            <Save size={14} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function RunCodexDialog({
  issue,
  workspaceId,
  liveMode,
  onClose,
  onStart,
}: {
  issue?: Issue;
  workspaceId: string | null;
  liveMode: boolean;
  onClose: () => void;
  onStart: (
    issueId: string,
    mode: CodingRun["mode"],
    options?: { repositoryId?: string; instructions?: string },
  ) => void;
}) {
  const [mode, setMode] = useState<CodingRun["mode"]>("Propose fix");
  const [repositoryId, setRepositoryId] = useState("");
  const [repositories, setRepositories] = useState<
    Array<{ id: string; name: string; localPath: string }>
  >([]);
  const [instructions, setInstructions] = useState("");
  const [loadingRepositories, setLoadingRepositories] = useState(liveMode);
  useEffect(() => {
    if (!liveMode || !workspaceId) {
      setLoadingRepositories(false);
      return;
    }
    void listLiveRepositories(workspaceId)
      .then((items) => {
        setRepositories(items);
        setRepositoryId(items[0]?.id ?? "");
      })
      .catch(() => setRepositories([]))
      .finally(() => setLoadingRepositories(false));
  }, [liveMode, workspaceId]);
  if (!issue) return null;
  const canStart = !liveMode || Boolean(repositoryId);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal run-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-codex-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">OpenAI Codex</span>
            <h2 id="run-codex-title">Run on {issue.identifier}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close Codex run dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <div className="run-context">
            <CircleDot size={15} />
            <div>
              <strong>{issue.title}</strong>
              <p>{issue.summary}</p>
            </div>
          </div>
          <label>
            Mode
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as CodingRun["mode"])
              }
            >
              <option>Investigate</option>
              <option>Propose fix</option>
              <option>Implement fix</option>
            </select>
          </label>
          <label>
            Repository
            <select
              aria-label="Codex repository"
              value={repositoryId}
              disabled={!liveMode || loadingRepositories}
              onChange={(event) => setRepositoryId(event.target.value)}
            >
              {!liveMode && (
                <option value="demo-repository">Demo repository</option>
              )}
              {liveMode && !repositories.length && (
                <option value="">No repository configured</option>
              )}
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.name} · {repository.localPath}
                </option>
              ))}
            </select>
          </label>
          {liveMode && !loadingRepositories && !repositories.length && (
            <div className="inline-empty">
              <GitBranch size={15} />
              <span>
                Configure a local repository in Settings before starting Codex.
              </span>
            </div>
          )}
          <label>
            Additional instructions
            <textarea
              aria-label="Additional run instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional acceptance criteria or context…"
            />
          </label>
          <div className="modal-note">
            <ShieldCheck size={14} />
            <span>
              Secrets are excluded. Push, merge, deploy and unrestricted shell
              are disabled.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!canStart || loadingRepositories}
            onClick={() =>
              onStart(issue.id, mode, {
                repositoryId: repositoryId || undefined,
                instructions: instructions.trim() || undefined,
              })
            }
          >
            <TerminalSquare size={15} /> Start run
          </button>
        </div>
      </div>
    </div>
  );
}

function PriorityDot({
  priority,
  showLabel = false,
}: {
  priority: Priority;
  showLabel?: boolean;
}) {
  const tone =
    priority === "Urgent"
      ? "urgent"
      : priority === "High"
        ? "high"
        : priority === "Medium"
          ? "medium"
          : priority === "Low"
            ? "low"
            : "none";
  return (
    <span className={`priority ${tone}`}>
      <span className="priority-glyph">
        {priority === "Urgent"
          ? "↑"
          : priority === "High"
            ? "↑"
            : priority === "Medium"
              ? "→"
              : priority === "Low"
                ? "↓"
                : "–"}
      </span>
      {showLabel && priority}
    </span>
  );
}

function InlineSelect({
  label,
  value,
  options,
  renderValue,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | AssigneeOption>;
  renderValue: (value: string) => ReactNode;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);
  if (editing)
    return (
      <select
        ref={selectRef}
        className="inline-edit-select"
        aria-label={`Edit ${label}`}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
      >
        {options.map((option) => (
          <option
            key={typeof option === "string" ? option : option.value}
            value={typeof option === "string" ? option : option.value}
          >
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </select>
    );
  return (
    <button
      className="inline-edit-trigger"
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
    >
      {renderValue(value)}
      <PenLine size={11} aria-hidden="true" />
    </button>
  );
}

function InlineText({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(value);
      inputRef.current?.focus();
    }
  }, [editing, value]);
  const save = () => {
    const cleanValue = draft.trim();
    if (cleanValue && cleanValue !== value) onSave(cleanValue);
    setEditing(false);
  };
  if (editing)
    return (
      <textarea
        ref={inputRef}
        className="inline-edit-textarea"
        aria-label={`Edit ${label}`}
        value={draft}
        maxLength={1000}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") save();
        }}
      />
    );
  return (
    <button
      className="inline-edit-text"
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
    >
      <span>{value}</span>
      <PenLine size={12} aria-hidden="true" />
    </button>
  );
}

function StatusPill({ status }: { status: IssueStatus }) {
  return (
    <span
      className={`status-pill status-${status.toLowerCase().replace(" ", "-")}`}
    >
      <span />
      {status}
    </span>
  );
}
function StatusRun({ status }: { status: CodingRun["status"] }) {
  return (
    <span className={`run-status-text ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}
function StatusArticle({ status }: { status: KnowledgeArticle["status"] }) {
  return (
    <span className={`article-status ${status.toLowerCase()}`}>{status}</span>
  );
}
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="property">
      <span>{label}</span>
      {children}
    </div>
  );
}
function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {action && <span className="section-action">{action}</span>}
    </div>
  );
}
function ActivityItem({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="activity-item">
      <span className="activity-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}
function RunRow({ run, onClick }: { run: CodingRun; onClick: () => void }) {
  return (
    <button className="run-row" type="button" onClick={onClick}>
      <div className={`run-status-dot ${run.status.toLowerCase()}`} />
      <div>
        <div>
          <strong>{run.mode}</strong>
          <span>{run.startedAt}</span>
        </div>
        <p>{run.summary}</p>
      </div>
      <ChevronRight size={15} />
    </button>
  );
}

export default App;
