import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorState, LoadingState } from "./shared/ui/ResourceState";
import { useConfirmation } from "./shared/ui/useConfirmation";
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
import { normalizeLocale, type SupportedLocale } from "./i18n/resources";
import { currentInterfaceLanguage } from "./i18n/preferences";
import {
  enableNativePush,
  dismissWorkspaceNotification,
  dismissWorkspaceNotifications,
  listWorkspaceNotifications,
  type PushSetupResult,
  type WorkspaceNotification,
} from "./api/notifications";
import {
  createRealtimeFallback,
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
  startLiveAgentRun,
  updateLiveAgentRun,
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
  RunAgentDialog as FeatureRunAgentDialog,
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
const FeatureKanbanPage = lazy(() =>
  import("./features/kanban/pages/KanbanPage").then(({ KanbanPage }) => ({
    default: KanbanPage,
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
  import("./features/settings/pages/SettingsWorkspacePage").then(
    ({ SettingsWorkspacePage }) => ({ default: SettingsWorkspacePage }),
  ),
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
  const pendingReactions = new Map(
    (existing?.messages ?? [])
      .filter((message) => message.pendingReaction !== undefined)
      .map((message) => [message.id, message]),
  );
  const merged = {
    ...snapshot,
    messages: [
      ...snapshot.messages.map((message) => {
        const pendingReaction = pendingReactions.get(message.id);
        return pendingReaction
          ? {
              ...message,
              reactions: pendingReaction.reactions,
              pendingReaction: pendingReaction.pendingReaction,
            }
          : message;
      }),
      ...pending,
    ],
  };
  return sortConversations(
    existing
      ? current.map((item) => (item.id === snapshot.id ? merged : item))
      : [merged, ...current],
  );
}

function App() {
  const { t } = useTranslation(["common", "issues"]);
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
  const [operationalLanguage, setOperationalLanguage] =
    useState<SupportedLocale>("en-US");
  const [workspaceOptions, setWorkspaceOptions] = useState<
    Array<{ id: string; name: string; defaultLanguage?: SupportedLocale }>
  >(demoMode ? [{ id: "demo", name: "Techne" }] : []);
  const [, setChannel] = useState<WhatsAppInstance | null>(null);
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
  const pendingRunActions = useRef(new Set<string>());
  const [selectedConversationId, setSelectedConversationId] = useState(
    demoMode ? (seedConversations[0]?.id ?? "") : "",
  );
  const [operatorIdentity, setOperatorIdentity] = useState({
    id: "",
    name: t("app.currentOperator"),
    email: "",
  });
  const [workspaceMemberNames, setWorkspaceMemberNames] = useState<
    Record<string, string>
  >({});
  const [inspectorIssueId, setInspectorIssueId] = useState<string | null>(null);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [editIssueId, setEditIssueId] = useState<string | null>(null);
  const [runDialogIssueId, setRunDialogIssueId] = useState<string | null>(null);
  const [runDialogInitialMode, setRunDialogInitialMode] =
    useState<CodingRun["mode"]>("Propose fix");
  const [runDialogRepositoryId, setRunDialogRepositoryId] = useState<
    string | undefined
  >();
  const [runDialogStage, setRunDialogStage] = useState<
    "research" | "implement" | "review" | "verify" | undefined
  >();
  const [runDialogResearchArtifactId, setRunDialogResearchArtifactId] =
    useState<string | undefined>();
  const [runDialogParentRunId, setRunDialogParentRunId] = useState<
    string | undefined
  >();
  const openRunDialog = (
    issueId: string,
    mode: CodingRun["mode"] = "Propose fix",
    repositoryId?: string,
    options?: {
      stage?: "research" | "implement" | "review" | "verify";
      parentRunId?: string;
      researchArtifactId?: string;
    },
  ) => {
    setRunDialogInitialMode(mode);
    setRunDialogRepositoryId(repositoryId);
    setRunDialogStage(options?.stage);
    setRunDialogParentRunId(options?.parentRunId);
    setRunDialogResearchArtifactId(options?.researchArtifactId);
    setRunDialogIssueId(issueId);
  };
  const { confirm: requestConfirmation, confirmationDialog } =
    useConfirmation();
  const handleProfileWorkspaceUpdated = useCallback(
    (workspace: { id: string; name: string; default_language?: string }) => {
      setWorkspaceId(workspace.id);
      setOperationalLanguage(normalizeLocale(workspace.default_language));
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
          : (data.user.email?.split("@")[0] ?? t("app.currentOperator"));
      setOperatorIdentity({
        id: data.user.id,
        name,
        email: data.user.email ?? "",
      });
    });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (demoMode || !workspaceId || !supabase) return;
    let active = true;
    void listWorkspaceMembers(workspaceId, supabase)
      .then((members) => {
        if (active)
          setWorkspaceMemberNames(
            Object.fromEntries(
              members.map((member) => [
                member.user_id,
                member.display_name?.trim() ||
                  `Workspace member ${member.user_id.slice(0, 8)}`,
              ]),
            ),
          );
      })
      .catch(() => {
        if (active) setWorkspaceMemberNames({});
      });
    return () => {
      active = false;
    };
  }, [demoMode, workspaceId]);

  const assigneeOptions: AssigneeOption[] = demoMode
    ? [
        { value: "Unassigned", label: t("app.unassigned") },
        { value: "Marina", label: "Marina" },
        { value: "João", label: "João" },
      ]
    : [
        { value: "Unassigned", label: t("app.unassigned") },
        ...Object.entries(workspaceMemberNames).map(([userId, name]) => ({
          value: userId,
          label: userId === operatorIdentity.id ? operatorIdentity.name : name,
        })),
      ];
  const assigneeLabel = (value: string) =>
    assigneeOptions.find((option) => option.value === value)?.label ??
    (value === "Unassigned"
      ? t("app.unassigned")
      : t("app.user", { id: value.slice(0, 8) }));

  useEffect(() => {
    if (demoMode || localOperatorMode) return;
    const client = supabase;
    if (!client) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let workspaceSubscribed = false;
    let reconcileQueue = Promise.resolve();
    let realtimeHealthy = false;
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
              defaultLanguage: normalizeLocale(item.default_language),
            })),
          );
        if (!workspace) {
          if (active) setWorkspaceLoading(false);
          return;
        }
        if (!active) return;
        setWorkspaceId(workspace.id);
        setOperationalLanguage(normalizeLocale(workspace.default_language));
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

                  if (table === "*") {
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
                        : t("errors.liveReconciliation"),
                    );
                });
            },
            {
              onStatus: (status) => {
                realtimeHealthy = status === "SUBSCRIBED";
                if (realtimeHealthy) {
                  realtimeFallback.stop();
                } else realtimeFallback.start();
              },
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
          setToast(t("toasts.liveDataUnavailable", { message }));
        }
      } finally {
        if (active && showLoading) setWorkspaceLoading(false);
      }
    };
    const realtimeFallback = createRealtimeFallback(
      () => {
        if (realtimeHealthy || !active) return;
        // ponytail: degraded mode uses the existing full snapshot; add a
        // cursor-based incremental query if workspace size makes this costly.
        reconcileQueue = reconcileQueue
          .then(() => (active ? hydrate(false) : undefined))
          .catch((error) => {
            if (active)
              setLiveDataError(
                error instanceof Error
                  ? error.message
                  : t("errors.liveReconciliation"),
              );
          });
      },
      () => realtimeHealthy,
    );
    void hydrate();
    return () => {
      active = false;
      unsubscribe();
      realtimeFallback.stop();
    };
  }, [demoMode, liveDataRetry, t, workspaceId]);

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
        setToast(t("toasts.issueCreatedLive"));
      } catch (error) {
        setToast(
          error instanceof Error ? error.message : t("errors.issueCreate"),
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
        : t("app.internalIssueSummary"),
      impact: t("app.issueImpactPending"),
      updatedAt: t("states.justNow"),
      createdAt: t("states.justNow"),
      agentRuns: 0,
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
    setToast(t("toasts.issueCreated", { identifier: issue.identifier }));
  };

  const dismissNotification = async (notificationId: string) => {
    if (!workspaceId || !supabase) return;
    const previous = notifications;
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
    try {
      await dismissWorkspaceNotification(supabase, workspaceId, notificationId);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : t("errors.notificationDismiss"),
      );
      setNotifications(previous);
    }
  };

  const dismissAllNotifications = async () => {
    if (!workspaceId || !supabase || !notifications.length) return;
    const previous = notifications;
    setNotifications([]);
    try {
      await dismissWorkspaceNotifications(supabase, workspaceId);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : t("errors.notificationsDismiss"),
      );
      setNotifications(previous);
    }
  };

  const enablePushNotifications = async () => {
    if (!workspaceId || !supabase) return;
    try {
      const status = await enableNativePush(supabase, workspaceId);
      setPushStatus(status);
      setToast(
        status === "enabled"
          ? t("toasts.nativeNotificationsEnabled")
          : status === "denied"
            ? t("toasts.browserNotificationsBlocked")
            : status === "unsupported"
              ? t("toasts.nativeNotificationsUnsupported")
              : t("toasts.nativeNotificationsNotConfigured"),
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : t("errors.nativeNotificationsEnable"),
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
            error instanceof Error ? error.message : t("errors.issueUpdate"),
          );
        });
    }
    setIssues((current) =>
      current.map((issue) =>
        issue.id === issueId
          ? { ...issue, ...patch, updatedAt: t("states.justNow") }
          : issue,
      ),
    );
  };

  const deleteIssue = async (issueId: string) => {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) return;
    if (
      !(await requestConfirmation({
        title: t("confirmations.deleteIssueTitle"),
        description: t("confirmations.deleteIssueDescription", {
          identifier: issue.identifier,
        }),
        confirmLabel: t("confirmations.deleteIssueConfirm"),
        destructive: true,
      }))
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
      if (window.location.pathname === `/issues/${issue.identifier}`) {
        window.history.pushState({}, "", "/issues");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      setToast(t("toasts.issueDeleted", { identifier: issue.identifier }));
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : t("errors.issueDelete"),
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
      setToast(t("toasts.issueResolved", { identifier: issue.identifier }));
      return true;
    } catch (error) {
      setToast(
        error instanceof Error
          ? `Resolution incomplete: ${error.message}`
          : t("errors.issueResolve"),
      );
      setLiveDataRetry((current) => current + 1);
      return false;
    }
  };

  const startRun = (
    issueId: string,
    mode: CodingRun["mode"],
    options?: {
      repositoryId?: string;
      instructions?: string;
      stage?: "research" | "implement" | "review" | "verify";
      parentRunId?: string;
      researchArtifactId?: string;
    },
  ) => {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue) return;
    if (!demoMode && workspaceId) {
      void startLiveAgentRun({
        workspaceId,
        issueId,
        issueIdentifier: issue.identifier,
        mode,
        ...(options?.stage
          ? { stage: options.stage }
          : mode === "Implement fix"
            ? {}
            : { stage: "research" as const }),
        ...options,
      })
        .then(() => {
          setRunDialogIssueId(null);
          setLiveDataRetry((current) => current + 1);
          setToast(
            t("toasts.agentRunQueued", { identifier: issue.identifier }),
          );
        })
        .catch((error) =>
          setToast(
            error instanceof Error ? error.message : t("errors.agentRunQueue"),
          ),
        );
      return;
    }
    const run: CodingRun = {
      id: `run-${Date.now()}`,
      issueId,
      issueIdentifier: issue.identifier,
      mode,
      status: "queued",
      progress: 8,
      startedAt: t("states.justNow"),
      duration: "00:00",
      summary: t("app.agentRunPreparing"),
      files: [],
      events: [
        {
          id: `event-${Date.now()}`,
          label: "run_started",
          detail: t("app.agentRunStartedDetail"),
          time: t("states.justNow"),
          tone: "accent",
        },
      ],
    };
    setRuns((current) => [run, ...current]);
    updateIssue(issueId, {
      agentRuns: issue.agentRuns + 1,
      status: issue.status === "Triage" ? "In Progress" : issue.status,
    });
    setRunDialogIssueId(null);
    setToast(t("toasts.agentRunStarted", { identifier: issue.identifier }));
  };

  const updateRun = (
    runId: string,
    action:
      | "cancel"
      | "approve"
      | "reject"
      | "publish"
      | "merge"
      | "deploy"
      | "health",
  ) => {
    const nextStatus: CodingRun["status"] =
      action === "cancel"
        ? "canceled"
        : action === "approve"
          ? "approved"
          : action === "publish"
            ? "approved"
            : action === "merge"
              ? "approved"
              : action === "deploy" || action === "health"
                ? "approved"
                : "rejected";
    const successMessage =
      action === "cancel"
        ? t("toasts.agentRunCanceled")
        : action === "approve"
          ? t("toasts.agentResultApproved")
          : action === "publish"
            ? t("toasts.agentBranchPublished")
            : action === "merge"
              ? t("toasts.agentPullRequestMerged")
              : action === "deploy"
                ? t("toasts.agentDeploymentStarted")
                : action === "health"
                  ? t("toasts.agentHealthChecked")
                  : t("toasts.agentResultRejected");
    const commitLocalAction = () => {
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
      setToast(successMessage);
    };
    if (!demoMode) {
      if (!workspaceId) return;
      const pendingKey = `${runId}:${action}`;
      if (pendingRunActions.current.has(pendingKey)) return;
      pendingRunActions.current.add(pendingKey);
      void updateLiveAgentRun({ workspaceId, runId, action })
        .then(() => {
          commitLocalAction();
          setLiveDataRetry((current) => current + 1);
        })
        .catch((error) =>
          setToast(
            error instanceof Error ? error.message : t("errors.agentRunUpdate"),
          ),
        )
        .finally(() => pendingRunActions.current.delete(pendingKey));
      return;
    }
    commitLocalAction();
  };

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
    >
      <ShellSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        onOpenCommand={() => setCommandOpen(true)}
        operator={operatorIdentity}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        onSignOut={() => {
          if (demoMode) {
            setToast(t("toasts.demoNoSession"));
            return;
          }
          void supabase?.auth.signOut().then(() => window.location.reload());
        }}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        pushStatus={pushStatus}
        onEnablePush={() => void enablePushNotifications()}
        onDismissNotification={(id) => void dismissNotification(id)}
        onDismissAllNotifications={() => void dismissAllNotifications()}
      />
      <main className="main-shell">
        <ShellMobileTopbar
          onOpenCommand={() => setCommandOpen(true)}
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          pushStatus={pushStatus}
          onEnablePush={() => void enablePushNotifications()}
          onDismissNotification={(id) => void dismissNotification(id)}
          onDismissAllNotifications={() => void dismissAllNotifications()}
        />
        {liveDataError && (
          <div className="live-data-error">
            <ErrorState
              title={t("errors.liveDataTitle")}
              description={t("errors.liveDataDescription", {
                message: liveDataError,
              })}
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
              initialLanguage={currentInterfaceLanguage()}
              onCreated={(workspace) => {
                setWorkspaceId(workspace.id);
                setOperationalLanguage("en-US");
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
                <FeatureBoundary label={t("states.loadingInbox")}>
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
                    onConfirm={requestConfirmation}
                    liveMode={!demoMode}
                    senderNames={{
                      ...workspaceMemberNames,
                      ...(operatorIdentity.id
                        ? { [operatorIdentity.id]: operatorIdentity.name }
                        : {}),
                    }}
                    knowledgeArticles={knowledgeArticles}
                    assigneeOptions={assigneeOptions}
                    assigneeLabel={assigneeLabel}
                  />
                </FeatureBoundary>
              }
              issuesList={
                <FeatureBoundary label={t("states.loadingIssues")}>
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
              issuesBoard={
                <FeatureBoundary label={t("states.loadingKanban")}>
                  <FeatureKanbanPage
                    fixedMode="shared"
                    workspaceId={workspaceId ?? ""}
                    currentUserId={operatorIdentity.id}
                    issues={issues}
                    assigneeLabel={assigneeLabel}
                    demoMode={demoMode}
                    onUpdateIssue={updateIssue}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onToast={setToast}
                  />
                </FeatureBoundary>
              }
              myWork={
                <FeatureBoundary label={t("states.loadingKanban")}>
                  <FeatureKanbanPage
                    fixedMode="personal"
                    workspaceId={workspaceId ?? ""}
                    currentUserId={operatorIdentity.id}
                    issues={issues}
                    assigneeLabel={assigneeLabel}
                    demoMode={demoMode}
                    onUpdateIssue={updateIssue}
                    onOpenIssue={setInspectorIssueId}
                    onNewIssue={() => setCreateIssueOpen(true)}
                    onToast={setToast}
                  />
                </FeatureBoundary>
              }
              issueDetail={
                <FeatureIssueDetailPage
                  issues={issues}
                  runs={runs}
                  workspaceId={workspaceId}
                  operationalLanguage={operationalLanguage}
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
                  onStartRun={openRunDialog}
                  onEditIssue={setEditIssueId}
                  onDeleteIssue={(issueId) => void deleteIssue(issueId)}
                  onUpdateIssue={updateIssue}
                  onResolveAndNotify={resolveIssueAndNotify}
                />
              }
              runs={
                <FeatureBoundary label={t("states.loadingAgentRuns")}>
                  <FeatureRunsPage
                    runs={runs}
                    onOpenIssue={setInspectorIssueId}
                    onStartRun={openRunDialog}
                    onUpdateRun={updateRun}
                    onRefresh={() => setLiveDataRetry((current) => current + 1)}
                  />
                </FeatureBoundary>
              }
              knowledge={
                <FeatureBoundary label={t("states.loadingKnowledge")}>
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
                <FeatureBoundary label={t("states.loadingSettings")}>
                  <FeatureSettingsPage
                    workspaceId={workspaceId}
                    onToast={setToast}
                    onChannelChange={setChannel}
                    onConfirm={requestConfirmation}
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
                <FeatureBoundary label={t("states.loadingInbox")}>
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
                    onConfirm={requestConfirmation}
                    liveMode={!demoMode}
                    senderNames={{
                      ...workspaceMemberNames,
                      ...(operatorIdentity.id
                        ? { [operatorIdentity.id]: operatorIdentity.name }
                        : {}),
                    }}
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
      <ShellMobileBottomNav
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        onSignOut={() => {
          if (demoMode) {
            setToast(t("toasts.demoNoSession"));
            return;
          }
          void supabase?.auth.signOut().then(() => window.location.reload());
        }}
      />
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
          onStartRun={openRunDialog}
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
          onStartRun={openRunDialog}
          onSwitchWorkspace={(nextWorkspaceId) => {
            const workspace = workspaceOptions.find(
              (item) => item.id === nextWorkspaceId,
            );
            if (!workspace || nextWorkspaceId === "demo") return;
            setWorkspaceId(workspace.id);
            setOperationalLanguage(workspace.defaultLanguage ?? "en-US");
            setSelectedConversationId("");
            setToast(t("toasts.workspaceSwitched", { name: workspace.name }));
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
          assigneeOptions={assigneeOptions}
          onClose={() => setEditIssueId(null)}
          onSave={(patch) => {
            updateIssue(editIssueId, patch);
            setEditIssueId(null);
          }}
        />
      )}
      {runDialogIssueId && (
        <FeatureRunAgentDialog
          issue={issues.find((item) => item.id === runDialogIssueId)}
          workspaceId={workspaceId}
          liveMode={!demoMode}
          initialMode={runDialogInitialMode}
          initialRepositoryId={runDialogRepositoryId}
          initialStage={runDialogStage}
          initialParentRunId={runDialogParentRunId}
          initialResearchArtifactId={runDialogResearchArtifactId}
          onClose={() => setRunDialogIssueId(null)}
          onStart={startRun}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={15} /> {toast}
        </div>
      )}
      {confirmationDialog}
    </div>
  );
}
export default App;
