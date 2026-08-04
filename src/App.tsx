import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorState, LoadingState } from "./shared/ui/ResourceState";
import { ProfileWorkspacePage } from "./components/ProfileWorkspacePage";
import { seedConversations, seedIssues, seedKnowledge, seedRuns } from "./data";
import type {
  Conversation,
  Issue,
  IssueType,
  KnowledgeArticle,
  Priority,
  CodingRun,
  Message,
} from "./types";
import { supabase } from "./lib/supabase";
import {
  enableNativePush,
  listWorkspaceNotifications,
  markWorkspaceNotificationRead,
  type PushSetupResult,
  type WorkspaceNotification,
} from "./api/notifications";
import {
  listMessagesSince,
  listWorkspaces,
  subscribeToWorkspace,
} from "./api/workspace-data";
import { listWorkspaceMembers } from "./api/auth";
import {
  createLiveIssue,
  deleteLiveIssue,
  isDemoModeRequested,
  isLiveConfigured,
  listLiveChannels,
  listWhatsAppInstances,
  loadLiveConversationSnapshot,
  loadLiveWorkspace,
  mendApiBaseUrl,
  resolveLiveConversation,
  sendLiveMessage,
  startLiveCodexRun,
  updateLiveCodexRun,
  updateLiveIssue,
  type WhatsAppInstance,
} from "./api/live-actions";
import { WorkspaceOnboarding as FeatureWorkspaceOnboarding } from "./app/onboarding/WorkspaceOnboarding";
import { WorkspaceRoutes } from "./app/routes/WorkspaceRoutes";
import {
  MobileBottomNav as ShellMobileBottomNav,
  MobileTopbar as ShellMobileTopbar,
  Sidebar as ShellSidebar,
} from "./app/shell/WorkspaceShell";
import {
  CommandPalette as FeatureCommandPalette,
  CreateIssueDialog as FeatureCreateIssueDialog,
  EditIssueDialog as FeatureEditIssueDialog,
  RunCodexDialog as FeatureRunCodexDialog,
} from "./features/issues/components/IssueDialogs";
import {
  IssueDetailPage as FeatureIssueDetailPage,
  IssueInspector as FeatureIssueInspector,
} from "./features/issues/components/IssueOverlays";
const FeatureInboxPage = lazy(() =>
  import("./features/inbox/pages/InboxPage").then(({ InboxPage }) => ({
    default: InboxPage,
  })),
);
const FeatureIssuesPage = lazy(() =>
  import("./features/issues/pages/IssuesPage").then(({ IssuesPage }) => ({
    default: IssuesPage,
  })),
);
const FeatureKnowledgePage = lazy(() =>
  import("./features/knowledge/pages/KnowledgePage").then(
    ({ KnowledgePage }) => ({ default: KnowledgePage }),
  ),
);
const FeatureKnowledgeWorkspacePage = lazy(() =>
  import("./features/knowledge/pages/KnowledgeWorkspacePage").then(
    ({ KnowledgeWorkspacePage }) => ({ default: KnowledgeWorkspacePage }),
  ),
);
const FeatureRunsPage = lazy(() =>
  import("./features/runs/pages/RunsPage").then(({ RunsPage }) => ({
    default: RunsPage,
  })),
);
const FeatureSettingsPage = lazy(() =>
  import("./features/settings/pages/SettingsPage").then(({ SettingsPage }) => ({
    default: SettingsPage,
  })),
);

function FeatureBoundary({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingState label={label} />}>{children}</Suspense>
  );
}

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
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>(
    [],
  );
  const [pushStatus, setPushStatus] = useState<PushSetupResult | "idle">(
    "idle",
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<
    Array<{ id: string; name: string }>
  >(demoMode ? [{ id: "demo", name: "Techne" }] : []);
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
        const workspaceNotifications = await listWorkspaceNotifications(
          client,
          workspace.id,
        );
        if (active) setNotifications(workspaceNotifications);
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

  const markNotificationRead = async (notificationId: string) => {
    if (!workspaceId || !supabase) return;
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read_at: new Date().toISOString() }
          : notification,
      ),
    );
    try {
      await markWorkspaceNotificationRead(
        supabase,
        workspaceId,
        notificationId,
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Notification could not be marked as read.",
      );
    }
  };

  const enablePushNotifications = async () => {
    if (!workspaceId || !supabase) return;
    try {
      const status = await enableNativePush(supabase, workspaceId);
      setPushStatus(status);
      setToast(
        status === "enabled"
          ? "Native notifications enabled"
          : status === "denied"
            ? "Browser notifications are blocked"
            : status === "unsupported"
              ? "This browser does not support native notifications here"
              : "Native notifications are not configured yet",
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Native notifications could not be enabled.",
      );
    }
  };

  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

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
      <ShellSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        onOpenCommand={() => setCommandOpen(true)}
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
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        pushStatus={pushStatus}
        onEnablePush={() => void enablePushNotifications()}
        onReadNotification={(id) => void markNotificationRead(id)}
      />
      <main className="main-shell">
        <ShellMobileTopbar
          operator={operatorIdentity}
          onOpenCommand={() => setCommandOpen(true)}
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          pushStatus={pushStatus}
          onEnablePush={() => void enablePushNotifications()}
          onReadNotification={(id) => void markNotificationRead(id)}
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
            <FeatureWorkspaceOnboarding
              onCreated={(workspace) => {
                setWorkspaceId(workspace.id);
                setWorkspaceOptions((current) => [
                  ...current.filter((item) => item.id !== workspace.id),
                  { id: workspace.id, name: workspace.name },
                ]);
                setLiveDataRetry((current) => current + 1);
              }}
            />
          ) : (
            <WorkspaceRoutes
              inbox={
                <FeatureBoundary label="Loading inbox…">
                  <FeatureInboxPage
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
                </FeatureBoundary>
              }
              issues={
                <FeatureBoundary label="Loading issues…">
                  <FeatureIssuesPage
                    issues={issues}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onEditIssue={setEditIssueId}
                    onDeleteIssue={(issueId) => void deleteIssue(issueId)}
                  />
                </FeatureBoundary>
              }
              issueDetail={
                <FeatureIssueDetailPage
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
              runs={
                <FeatureBoundary label="Loading Codex runs…">
                  <FeatureRunsPage
                    runs={runs}
                    onOpenIssue={setInspectorIssueId}
                    onStartRun={setRunDialogIssueId}
                    onUpdateRun={updateRun}
                    onRefresh={() => setLiveDataRetry((current) => current + 1)}
                  />
                </FeatureBoundary>
              }
              knowledge={
                <FeatureBoundary label="Loading knowledge…">
                  {demoMode ? (
                    <FeatureKnowledgePage />
                  ) : (
                    <FeatureKnowledgeWorkspacePage
                      workspaceId={workspaceId}
                      onToast={setToast}
                    />
                  )}
                </FeatureBoundary>
              }
              settings={
                <FeatureBoundary label="Loading settings…">
                  <FeatureSettingsPage
                    workspaceId={workspaceId}
                    onToast={setToast}
                    onChannelChange={setChannel}
                  />
                </FeatureBoundary>
              }
              profile={
                <ProfileWorkspacePage
                  workspaceId={workspaceId}
                  onToast={setToast}
                  onWorkspaceUpdated={handleProfileWorkspaceUpdated}
                  onIdentityUpdated={handleProfileIdentityUpdated}
                />
              }
              fallback={
                <FeatureBoundary label="Loading inbox…">
                  <FeatureInboxPage
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
                </FeatureBoundary>
              }
            />
          )}
        </ErrorBoundary>
      </main>
      <ShellMobileBottomNav />
      {inspectorIssueId && (
        <FeatureIssueInspector
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
        <FeatureCommandPalette
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
            setSelectedConversationId("");
            setToast(`Switched to ${workspace.name}`);
          }}
        />
      )}
      {createIssueOpen && (
        <FeatureCreateIssueDialog
          conversations={conversations}
          onClose={() => setCreateIssueOpen(false)}
          onCreate={createIssue}
        />
      )}
      {editIssueId && (
        <FeatureEditIssueDialog
          issue={issues.find((item) => item.id === editIssueId)}
          onClose={() => setEditIssueId(null)}
          onSave={(patch) => {
            updateIssue(editIssueId, patch);
            setEditIssueId(null);
          }}
        />
      )}
      {runDialogIssueId && (
        <FeatureRunCodexDialog
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
export default App;
