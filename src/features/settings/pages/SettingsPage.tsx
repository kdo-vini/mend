import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  ChevronRight,
  GitBranch,
  Github,
  Info,
  Link2,
  MessageCircle,
  PenLine,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { AiMode, CodingAgentProvider } from "../../../types";
import { currentInterfaceLanguage } from "../../../i18n/preferences";
import type {
  GoogleConnection,
  LiveGitHubConnection,
  LiveGitHubRepository,
  McpConnection,
  WhatsAppInstance,
} from "../api";
import {
  connectLiveChannel,
  connectWhatsAppInstance,
  createLiveChannel,
  createLiveRepository,
  createWhatsAppInstance,
  disconnectLiveChannel,
  disconnectWhatsAppInstance,
  getLiveChannelQr,
  getWhatsAppQr,
  loadLiveChannelFlow,
  listLiveChannels,
  listLiveRepositories,
  listLiveGoogleConnections,
  saveLiveGoogleCalendarSelection,
  getLiveGitHubConnection,
  listLiveGitHubRepositories,
  startLiveGitHubWorkspaceSetup,
  disconnectLiveGitHub,
  updateLiveRepository,
  removeLiveRepository,
  listLiveAgentCredentials,
  saveLiveAgentCredential,
  removeLiveAgentCredential,
  type LiveAgentCredential,
  listLiveAgentConnections,
  createLiveAgentConnection,
  updateLiveAgentConnection,
  revokeLiveAgentConnection,
  verifyLiveAgentConnection,
  refreshLiveAgentModels,
  startLiveAgentLogin,
  pollLiveAgentLogin,
  cancelLiveAgentLogin,
  listLiveAgentRoutingPolicies,
  saveLiveAgentRoutingPolicy,
  type LiveAgentConnection,
  type LiveAgentLoginJob,
  type LiveStageRoutingPolicy,
  startLiveGoogleOAuth,
  disconnectLiveGoogleConnection,
  createLiveMcpConnection,
  disconnectLiveMcpConnection,
  listLiveMcpConnections,
  startLiveMcpOAuth,
  testLiveMcpConnection,
  updateLiveMcpConnection,
  listWhatsAppInstances,
  refreshLiveChannel,
  saveLiveChannelFlow,
} from "../api";
import {
  listLiveAuditLog,
  loadLiveAiConversationPolicy,
  saveLiveConversationAiPolicy,
  saveLiveWorkspaceAiPolicy,
  type AuditLogRecord,
  type LiveWorkspaceAiPolicy,
} from "../api";
import {
  defaultSupportFlow,
  supportFlowSchema,
  type SupportFlow,
} from "../../../shared/support-flow";
import {
  aiTriageRouteValues,
  triageIntentValues,
  type AiTriageRoute,
  type TriageIntent,
  aiPolicyActionValues,
  aiPolicyChannelValues,
  aiPolicyIntegrationValues,
  type AiPolicyAction,
  type AiPolicyChannel,
  type AiPolicyIntegration,
} from "../../../ai-policy";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { Select } from "../../../shared/ui/Select";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { MembersPanel } from "../components/MembersPanel";

const triageIntentLabels: Record<TriageIntent, string> = {
  question: "Question / pricing",
  how_to: "How-to",
  status: "Status",
  bug: "Bug report",
  incident: "Incident",
  billing: "Billing",
  feature: "Feature request",
  social: "Greeting / thanks / farewell",
  other: "Other / unknown",
};

const triageRouteLabels: Record<AiTriageRoute, string> = {
  knowledge_auto_reply: "Answer from published knowledge",
  safe_auto_reply: "Low-risk reply without knowledge",
  draft_for_review: "Draft for human review",
  human_escalation: "Escalate and notify human",
  bug_triage: "Bug triage",
  no_action: "No action",
};

const aiPolicyActionLabels: Record<AiPolicyAction, string> = {
  respond: "Respond to customers",
  triage: "Triage conversations",
  create_issue: "Create issues",
  investigate: "Investigate with a coding agent",
  propose_fix: "Propose code fixes",
  implement_fix: "Implement code fixes",
  publish: "Publish changes",
  deploy: "Deploy changes",
  delete: "Delete data",
};

const aiPolicyChannelLabels: Record<AiPolicyChannel, string> = {
  whatsapp: "WhatsApp",
  web: "Web conversations",
};

const aiPolicyIntegrationLabels: Record<AiPolicyIntegration, string> = {
  knowledge: "Published knowledge",
  google_calendar: "Google Calendar",
  agent: "Agent execution",
  mcp: "MCP plugins",
};

function agentProviderLabel(provider: CodingAgentProvider): string {
  return {
    openai: "ChatGPT",
    anthropic: "Claude",
    google: "Gemini",
    verboo: "Verboo",
  }[provider];
}

export function SettingsPage({
  workspaceId,
  onToast,
  onChannelChange,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onChannelChange: (channel: WhatsAppInstance | null) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  type SettingsTab =
    | "whatsapp"
    | "connections"
    | "members"
    | "ai"
    | "flows"
    | "repositories"
    | "audit";
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "connections") return "connections";
      if (tab === "repositories") return "repositories";
    }
    return "whatsapp";
  });
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [googleConnections, setGoogleConnections] = useState<
    GoogleConnection[]
  >([]);
  const [googleAction, setGoogleAction] = useState<string | null>(null);
  const [mcpConnections, setMcpConnections] = useState<McpConnection[]>([]);
  const [mcpAction, setMcpAction] = useState<string | null>(null);
  const [mcpName, setMcpName] = useState("");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpAuthMode, setMcpAuthMode] =
    useState<McpConnection["authMode"]>("none");
  const [mcpHeaders, setMcpHeaders] = useState("{}");
  const [selected, setSelected] = useState<WhatsAppInstance | null>(null);
  const [instanceName, setInstanceName] = useState("mend-techne");
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelAction, setChannelAction] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [aiPolicy, setAiPolicy] = useState<LiveWorkspaceAiPolicy | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>("draft");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiPolicySaving, setAiPolicySaving] = useState(false);
  const [repositories, setRepositories] = useState<
    Array<{
      id: string;
      name: string;
      defaultBranch: string;
      agentProvider: CodingAgentProvider;
      executionPlane: "dokploy" | "github_actions";
      githubOwner?: string;
      githubRepo?: string;
      githubInstallationId?: string;
    }>
  >([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState<string | null>(
    null,
  );
  const [githubConnection, setGithubConnection] =
    useState<LiveGitHubConnection>({ connected: false });
  const [githubRepositories, setGithubRepositories] = useState<
    LiveGitHubRepository[]
  >([]);
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] =
    useState(false);
  const [githubAction, setGithubAction] = useState<
    "connect" | "disconnect" | null
  >(null);
  const [agentCredentials, setAgentCredentials] = useState<
    LiveAgentCredential[]
  >([]);
  const [codingConnections, setCodingConnections] = useState<
    LiveAgentConnection[]
  >([]);
  const [codingPolicies, setCodingPolicies] = useState<
    LiveStageRoutingPolicy[]
  >([]);
  const [codingConnectionLabel, setCodingConnectionLabel] = useState("");
  const [codingConnectionProvider, setCodingConnectionProvider] =
    useState<CodingAgentProvider>("openai");
  const [codingConnectionAuthMethod, setCodingConnectionAuthMethod] = useState<
    "api_key" | "subscription"
  >("api_key");
  const [codingConnectionKey, setCodingConnectionKey] = useState("");
  const [codingSaving, setCodingSaving] = useState(false);
  const [codingLoginJob, setCodingLoginJob] =
    useState<LiveAgentLoginJob | null>(null);
  const [credentialTask, setCredentialTask] = useState<"support" | "agent">(
    "agent",
  );
  const [credentialProvider, setCredentialProvider] =
    useState<CodingAgentProvider>("openai");
  const [credentialKey, setCredentialKey] = useState("");
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [editingRepositoryId, setEditingRepositoryId] = useState<string | null>(
    null,
  );
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryBranch, setRepositoryBranch] = useState("main");
  const [repositoryAgent, setRepositoryAgent] =
    useState<CodingAgentProvider>("openai");
  const repositoryPlane = "dokploy" as const;
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [flow, setFlow] = useState<SupportFlow | null>(null);
  const [flowNodeId, setFlowNodeId] = useState<string>();
  const [flowSaving, setFlowSaving] = useState(false);

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
    if (!workspaceId || !selected?.channelId) return;
    let stopped = false;
    const refreshHealth = async () => {
      try {
        const next = await refreshLiveChannel({
          workspaceId,
          channelId: selected.channelId!,
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
      } catch {
        // The visible health state stays on the last confirmed value.
      }
    };
    const timer = setInterval(() => void refreshHealth(), 15_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [onChannelChange, selected?.channelId, workspaceId]);

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
      if (activeTab === "audit")
        setAuditLog(await listLiveAuditLog(workspaceId));
      if (activeTab === "ai") {
        const policy = await loadLiveAiConversationPolicy(workspaceId);
        setAiPolicy(policy);
        if (policy.dominantMode !== "mixed") setAiMode(policy.dominantMode);
      }
      if (activeTab === "connections") {
        const [google, mcp] = await Promise.all([
          listLiveGoogleConnections(workspaceId),
          listLiveMcpConnections(workspaceId),
        ]);
        setGoogleConnections(google);
        setMcpConnections(mcp);
      }
      if (activeTab === "flows" && selected?.channelId) {
        setFlow(
          (await loadLiveChannelFlow({
            workspaceId,
            channelId: selected.channelId,
          })) ?? defaultSupportFlow(),
        );
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
  }, [activeTab, selected?.channelId, workspaceId]);

  useEffect(() => {
    void loadSettingsData();
  }, [loadSettingsData]);

  const loadRepositories = useCallback(async () => {
    if (!workspaceId) return;
    setRepositoriesLoading(true);
    setRepositoriesError(null);
    try {
      const [rows, connection] = await Promise.all([
        listLiveRepositories(workspaceId),
        getLiveGitHubConnection(workspaceId),
      ]);
      setRepositories(rows);
      setGithubConnection(connection);
      setGithubRepositoriesLoading(connection.connected);
      if (connection.connected)
        setGithubRepositories(await listLiveGitHubRepositories(workspaceId));
      else setGithubRepositories([]);
    } catch (reason) {
      setRepositoriesError(
        reason instanceof Error
          ? reason.message
          : "Repositories could not be loaded.",
      );
    } finally {
      setGithubRepositoriesLoading(false);
      setRepositoriesLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || activeTab !== "repositories") return;
    void loadRepositories();
  }, [activeTab, loadRepositories, workspaceId]);

  useEffect(() => {
    if (activeTab !== "repositories" || !workspaceId) return;
    void listLiveAgentCredentials(workspaceId)
      .then(setAgentCredentials)
      .catch(() => setAgentCredentials([]));
  }, [activeTab, workspaceId]);

  useEffect(() => {
    if (activeTab !== "repositories" || !workspaceId) return;
    void Promise.all([
      listLiveAgentConnections(workspaceId),
      listLiveAgentRoutingPolicies({ workspaceId }),
    ])
      .then(([connections, policies]) => {
        setCodingConnections(connections);
        setCodingPolicies(policies);
      })
      .catch(() => {
        setCodingConnections([]);
        setCodingPolicies([]);
      });
  }, [activeTab, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !codingLoginJob) return;
    if (!["pending", "awaiting_user"].includes(codingLoginJob.status)) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void pollLiveAgentLogin({
        workspaceId,
        jobId: codingLoginJob.id,
      })
        .then((job) => {
          if (stopped) return;
          setCodingLoginJob(job);
          if (!["pending", "awaiting_user"].includes(job.status)) {
            window.clearInterval(timer);
            if (job.status === "completed") {
              onToast("Subscription connected");
              void listLiveAgentConnections(workspaceId).then(
                setCodingConnections,
              );
            }
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [codingLoginJob, onToast, workspaceId]);

  const saveCredential = async () => {
    if (!workspaceId || !credentialKey.trim()) return;
    setCredentialSaving(true);
    try {
      const saved = await saveLiveAgentCredential({
        workspaceId,
        task: credentialTask,
        provider: credentialProvider,
        apiKey: credentialKey,
      });
      setAgentCredentials((current) => [
        ...current.filter(
          (item) =>
            item.task !== saved.task || item.provider !== saved.provider,
        ),
        saved,
      ]);
      setCredentialKey("");
      onToast("Credential saved securely");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Credential could not be saved.",
      );
    } finally {
      setCredentialSaving(false);
    }
  };

  const removeCredential = async (credential: LiveAgentCredential) => {
    if (!workspaceId) return;
    setCredentialSaving(true);
    try {
      await removeLiveAgentCredential({
        workspaceId,
        task: credential.task,
        provider: credential.provider,
      });
      setAgentCredentials((current) =>
        current.filter(
          (item) =>
            item.task !== credential.task ||
            item.provider !== credential.provider,
        ),
      );
      onToast("Credential removed");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Credential could not be removed.",
      );
    } finally {
      setCredentialSaving(false);
    }
  };

  const saveCodingConnection = async () => {
    if (!workspaceId || !codingConnectionLabel.trim()) return;
    if (
      codingConnectionAuthMethod === "api_key" &&
      !codingConnectionKey.trim()
    ) {
      onToast("An API key is required for an API-key connection.");
      return;
    }
    if (codingConnectionAuthMethod === "subscription") {
      if (codingConnectionProvider === "google") {
        onToast(
          "Gemini subscription login is unavailable on this headless runner yet; use a Gemini API key.",
        );
        return;
      }
      if (codingConnectionProvider === "anthropic") {
        onToast(
          "Claude.ai login is unavailable on Mend hosted runners for compliance reasons; use an Anthropic API key.",
        );
        return;
      }
      try {
        const job = await startLiveAgentLogin({
          workspaceId,
          provider: "openai",
          label: codingConnectionLabel,
        });
        setCodingLoginJob(job);
        onToast("Subscription login started");
      } catch (reason) {
        onToast(
          reason instanceof Error ? reason.message : "Login could not start.",
        );
      }
      return;
    }
    setCodingSaving(true);
    try {
      const connection = await createLiveAgentConnection({
        workspaceId,
        label: codingConnectionLabel,
        provider: codingConnectionProvider,
        authMethod: "api_key",
        apiKey: codingConnectionKey,
      });
      setCodingConnections((current) => [connection, ...current]);
      setCodingConnectionKey("");
      onToast("Coding API key saved securely");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Connection could not be saved.",
      );
    } finally {
      setCodingSaving(false);
    }
  };

  const updateCodingConsent = async (
    connection: LiveAgentConnection,
    automationConsent: boolean,
  ) => {
    if (!workspaceId) return;
    try {
      const updated = await updateLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
        automationConsent,
      });
      setCodingConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Consent could not be updated.",
      );
    }
  };

  const refreshCodingConnection = async (connection: LiveAgentConnection) => {
    if (!workspaceId) return;
    setCodingSaving(true);
    try {
      const updated = await verifyLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
      });
      setCodingConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onToast(
        updated.status === "connected"
          ? "Coding connection verified"
          : "Coding connection needs attention",
      );
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Connection verification failed.",
      );
    } finally {
      setCodingSaving(false);
    }
  };

  const refreshCodingCatalog = async (connection: LiveAgentConnection) => {
    if (!workspaceId) return;
    setCodingSaving(true);
    try {
      const catalog = await refreshLiveAgentModels({
        workspaceId,
        connectionId: connection.id,
      });
      setCodingConnections((current) =>
        current.map((item) =>
          item.id === connection.id
            ? { ...item, catalog, status: "connected" }
            : item,
        ),
      );
      onToast("Model catalog refreshed");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Model catalog is unavailable.",
      );
    } finally {
      setCodingSaving(false);
    }
  };

  const revokeCodingConnection = async (connection: LiveAgentConnection) => {
    if (!workspaceId) return;
    if (
      !(await onConfirm({
        title: "Revoke coding connection?",
        description:
          "This disables the connection for future runs and removes its server-side secret.",
        confirmLabel: "Revoke connection",
        destructive: true,
      }))
    )
      return;
    try {
      await revokeLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
      });
      setCodingConnections((current) =>
        current.map((item) =>
          item.id === connection.id
            ? { ...item, status: "revoked", automationConsent: false }
            : item,
        ),
      );
      onToast("Coding connection revoked");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Connection could not be revoked.",
      );
    }
  };

  const codingPolicyFor = (stage: LiveStageRoutingPolicy["stage"]) =>
    codingPolicies.find((policy) => policy.stage === stage) ?? {
      stage,
      preset: "Custom" as const,
    };

  const updateCodingPolicy = (
    stage: LiveStageRoutingPolicy["stage"],
    patch: Partial<LiveStageRoutingPolicy>,
  ) => {
    setCodingPolicies((current) => {
      const existing = current.find((policy) => policy.stage === stage) ?? {
        stage,
        preset: "Custom" as const,
      };
      const next = { ...existing, ...patch, stage };
      return [...current.filter((policy) => policy.stage !== stage), next];
    });
  };

  const saveCodingPolicy = async (stage: LiveStageRoutingPolicy["stage"]) => {
    if (!workspaceId) return;
    try {
      const saved = await saveLiveAgentRoutingPolicy({
        workspaceId,
        policy: codingPolicyFor(stage),
      });
      setCodingPolicies((current) => [
        ...current.filter((policy) => policy.stage !== stage),
        saved,
      ]);
      onToast(`${stage} routing policy saved`);
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Routing policy could not be saved.",
      );
    }
  };

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

  const resetRepositoryForm = () => {
    setEditingRepositoryId(null);
    setRepositoryName("");
    setRepositoryBranch("main");
    setRepositoryAgent("openai");
    setGithubOwner(githubConnection.owner ?? "");
    setGithubRepo("");
  };

  const editRepository = (repository: (typeof repositories)[number]) => {
    setEditingRepositoryId(repository.id);
    setRepositoryName(repository.name);
    setRepositoryBranch(repository.defaultBranch);
    setRepositoryAgent(repository.agentProvider);
    setGithubOwner(githubConnection.owner ?? repository.githubOwner ?? "");
    setGithubRepo(repository.githubRepo ?? "");
    window.setTimeout(() => {
      document
        .getElementById("repository-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const saveRepository = async () => {
    if (!workspaceId || !repositoryName.trim() || !githubRepo.trim()) return;
    setChannelAction(true);
    try {
      const githubFields =
        githubConnection.connected && githubRepo
          ? {
              githubOwner: githubConnection.owner ?? githubOwner,
              githubRepo,
            }
          : {};
      const repository = editingRepositoryId
        ? await updateLiveRepository({
            workspaceId,
            repositoryId: editingRepositoryId,
            name: repositoryName,
            defaultBranch: repositoryBranch,
            agentProvider: repositoryAgent,
            executionPlane: repositoryPlane,
            ...githubFields,
          })
        : await createLiveRepository({
            workspaceId,
            name: repositoryName,
            defaultBranch: repositoryBranch,
            agentProvider: repositoryAgent,
            executionPlane: repositoryPlane,
            ...githubFields,
          });
      setRepositories((current) =>
        editingRepositoryId
          ? current.map((item) =>
              item.id === repository.id ? repository : item,
            )
          : [repository, ...current],
      );
      resetRepositoryForm();
      onToast(
        editingRepositoryId ? "Repository updated" : "Repository configured",
      );
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

  const removeRepository = async (
    repository: (typeof repositories)[number],
  ) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: `Remove ${repository.name}?`,
        description:
          "This removes the repository configuration from the workspace. It does not delete anything on disk or GitHub.",
        confirmLabel: "Remove repository",
        destructive: true,
      }))
    )
      return;
    setChannelAction(true);
    try {
      await removeLiveRepository({
        workspaceId,
        repositoryId: repository.id,
      });
      setRepositories((current) =>
        current.filter((item) => item.id !== repository.id),
      );
      if (editingRepositoryId === repository.id) resetRepositoryForm();
      onToast("Repository removed");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Repository could not be removed.",
      );
    } finally {
      setChannelAction(false);
    }
  };

  const connectWorkspaceGitHub = async () => {
    if (!workspaceId) return;
    setGithubAction("connect");
    try {
      const { installationUrl } =
        await startLiveGitHubWorkspaceSetup(workspaceId);
      window.location.assign(installationUrl);
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "GitHub App setup could not start.",
      );
      setGithubAction(null);
    }
  };

  const disconnectWorkspaceGitHub = async () => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Disconnect GitHub from this workspace?",
        description:
          "Repository configurations stay in Mend, but GitHub publishing and repository selection will be disconnected until you connect an installation again.",
        confirmLabel: "Disconnect GitHub",
        destructive: true,
      }))
    )
      return;
    setGithubAction("disconnect");
    try {
      await disconnectLiveGitHub(workspaceId);
      await loadRepositories();
      onToast("GitHub disconnected");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "GitHub could not be disconnected.",
      );
    } finally {
      setGithubAction(null);
    }
  };

  const saveAiPolicy = async () => {
    if (!workspaceId || !aiPolicy?.totalConversations) return;
    if (
      aiMode === "safe_auto" &&
      !(await onConfirm({
        title: "Enable Auto-reply?",
        description:
          "Auto-reply remains blocked unless the explicit send policy is enabled.",
        confirmLabel: "Enable Auto-reply",
      }))
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
      !(await onConfirm({
        title: "Enable automatic replies?",
        description:
          "Only configured routes with relevant published knowledge can send replies.",
        confirmLabel: "Enable automatic replies",
      }))
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

  const togglePolicyValue = (
    field:
      | "allowedChannels"
      | "allowedIntegrations"
      | "allowedActions"
      | "humanApprovalActions",
    value: AiPolicyChannel | AiPolicyIntegration | AiPolicyAction,
    checked: boolean,
  ) => {
    setAiPolicy((current) => {
      if (!current) return current;
      const values = current[field] as string[];
      const next = checked
        ? [...new Set([...values, value])]
        : values.filter((item) => item !== value);
      return { ...current, [field]: next } as LiveWorkspaceAiPolicy;
    });
  };

  const connectGoogle = async () => {
    if (!workspaceId) return;
    setGoogleAction("connect");
    try {
      const { oauthUrl } = await startLiveGoogleOAuth(workspaceId);
      window.location.assign(oauthUrl);
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Google OAuth is not configured.",
      );
    } finally {
      setGoogleAction(null);
    }
  };

  const saveGoogleCalendars = async (
    connection: GoogleConnection,
    selectedCalendarIds: string[],
  ) => {
    if (!workspaceId) return;
    setGoogleAction(connection.id);
    try {
      const updated = await saveLiveGoogleCalendarSelection(
        workspaceId,
        connection.id,
        selectedCalendarIds,
      );
      setGoogleConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onToast("Google calendar selection saved");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Google calendar selection could not be saved.",
      );
    } finally {
      setGoogleAction(null);
    }
  };

  const disconnectGoogle = async (connection: GoogleConnection) => {
    if (!workspaceId) return;
    if (
      !(await onConfirm({
        title: "Disconnect Google account?",
        description: `Disconnect ${connection.accountEmail ?? "this Google account"}? Its server-side tokens will be removed.`,
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setGoogleAction(connection.id);
    try {
      const updated = await disconnectLiveGoogleConnection(
        workspaceId,
        connection.id,
      );
      setGoogleConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onToast("Google account disconnected");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Google account could not be disconnected.",
      );
    } finally {
      setGoogleAction(null);
    }
  };

  const createMcp = async () => {
    if (!workspaceId || !mcpName.trim() || !mcpUrl.trim()) return;
    let headers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(mcpHeaders || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        headers = parsed;
      else throw new Error("Headers must be a JSON object.");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Headers JSON is invalid.",
      );
      return;
    }
    setMcpAction("create");
    try {
      const created = await createLiveMcpConnection(workspaceId, {
        name: mcpName.trim(),
        description: mcpDescription.trim(),
        serverUrl: mcpUrl.trim(),
        authMode: mcpAuthMode,
        ...(mcpAuthMode === "headers" ? { headers } : {}),
      });
      setMcpConnections((current) => [created, ...current]);
      setMcpName("");
      setMcpDescription("");
      setMcpUrl("");
      onToast("MCP plugin connected. Select tools before using it.");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "MCP plugin could not be connected.",
      );
    } finally {
      setMcpAction(null);
    }
  };

  const testMcp = async (connection: McpConnection) => {
    if (!workspaceId) return;
    setMcpAction(connection.id);
    try {
      const updated = await testLiveMcpConnection(workspaceId, connection.id);
      setMcpConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onToast(
        `Discovered ${updated.tools.length} MCP tools. None were enabled automatically.`,
      );
    } catch (reason) {
      onToast(
        reason instanceof Error ? reason.message : "MCP plugin test failed.",
      );
    } finally {
      setMcpAction(null);
    }
  };

  const saveMcp = async (
    connection: McpConnection,
    update: Partial<Pick<McpConnection, "allowedToolNames" | "writeModes">>,
  ) => {
    if (!workspaceId) return;
    if (update.writeModes?.length && !connection.writeModes.length) {
      const confirmed = await onConfirm({
        title: "Allow MCP writes?",
        description:
          "Copilot may alter the connected system before showing a draft. Auto-reply may alter it and respond without human review. Generic or SQL tools can have broad access.",
        confirmLabel: "Allow writes",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setMcpAction(connection.id);
    try {
      const updated = await updateLiveMcpConnection(
        workspaceId,
        connection.id,
        {
          name: connection.name,
          description: connection.description,
          allowedToolNames:
            update.allowedToolNames ?? connection.allowedToolNames,
          writeModes: update.writeModes ?? connection.writeModes,
        },
      );
      setMcpConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "MCP plugin settings could not be saved.",
      );
    } finally {
      setMcpAction(null);
    }
  };

  const disconnectMcp = async (connection: McpConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Disconnect MCP plugin?",
        description:
          "This removes its server-side credentials and disables all tools.",
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setMcpAction(connection.id);
    try {
      const updated = await disconnectLiveMcpConnection(
        workspaceId,
        connection.id,
      );
      setMcpConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      onToast("MCP plugin disconnected");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "MCP plugin could not be disconnected.",
      );
    } finally {
      setMcpAction(null);
    }
  };

  const saveFlow = async () => {
    if (!workspaceId || !selected?.channelId || !flow) return;
    const parsed = supportFlowSchema.safeParse(flow);
    if (!parsed.success) {
      onToast(parsed.error.issues[0]?.message ?? "Flow is invalid.");
      return;
    }
    setFlowSaving(true);
    try {
      await saveLiveChannelFlow({
        workspaceId,
        channelId: selected.channelId,
        flow: parsed.data,
      });
      setFlow(parsed.data);
      onToast("Support flow saved");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Support flow could not be saved.",
      );
    } finally {
      setFlowSaving(false);
    }
  };

  const updateFlow = (update: (current: SupportFlow) => SupportFlow) =>
    setFlow((current) => (current ? update(current) : current));
  const addFlowNode = () => {
    updateFlow((current) => {
      const id = `step-${Date.now()}`;
      return {
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            title: "New step",
            type: "message",
            message: "Write the message this step should send.",
            options: [],
          },
        ],
      };
    });
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
    { id: "whatsapp", label: t("tabs.whatsapp"), icon: MessageCircle },
    { id: "connections", label: t("tabs.plugins"), icon: Link2 },
    { id: "members", label: t("tabs.members"), icon: UsersRound },
    { id: "ai", label: t("tabs.ai"), icon: Bot },
    { id: "flows", label: t("tabs.flows"), icon: GitBranch },
    { id: "repositories", label: t("tabs.repositories"), icon: GitBranch },
    { id: "audit", label: t("tabs.audit"), icon: ShieldCheck },
  ];
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(currentInterfaceLanguage(), {
          dateStyle: "short",
          timeStyle: "short",
        }).format(date);
  };
  const selectedFlowNode =
    flow?.nodes.find((node) => node.id === flowNodeId) ?? flow?.nodes[0];
  const health = (() => {
    if (!selected || selected.state !== "open")
      return { label: "Offline", tone: "offline" };
    if (!selected.lastEventAt) return { label: "Connected", tone: "connected" };
    const age = Date.now() - new Date(selected.lastEventAt).getTime();
    return age > 90_000
      ? { label: "Needs attention", tone: "warning" }
      : { label: "Healthy", tone: "connected" };
  })();

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("ui.eyebrow")}
        title={t("ui.title")}
        description={t("ui.description")}
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
                    <h2>MCP plugins</h2>
                    <p>
                      Connect a trusted company MCP server. Tools are discovered
                      for review and none are enabled automatically.
                    </p>
                  </div>
                </div>
                <div className="settings-form-grid">
                  <label>
                    Plugin name
                    <input
                      value={mcpName}
                      onChange={(event) => setMcpName(event.target.value)}
                      placeholder="Zelo workspace"
                    />
                  </label>
                  <label>
                    Purpose
                    <input
                      value={mcpDescription}
                      onChange={(event) =>
                        setMcpDescription(event.target.value)
                      }
                      placeholder="Find customers and account status"
                    />
                  </label>
                  <label>
                    MCP server URL
                    <input
                      value={mcpUrl}
                      onChange={(event) => setMcpUrl(event.target.value)}
                      placeholder="https://mcp.example.com"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    Authentication
                    <Select
                      value={mcpAuthMode}
                      onChange={(value) =>
                        setMcpAuthMode(value as McpConnection["authMode"])
                      }
                      options={[
                        { value: "none", label: "None" },
                        { value: "headers", label: "Secret headers" },
                        { value: "oauth", label: "OAuth" },
                      ]}
                    />
                  </label>
                  {mcpAuthMode === "headers" && (
                    <label className="settings-form-wide">
                      Secret headers (JSON; stored encrypted)
                      <textarea
                        value={mcpHeaders}
                        onChange={(event) => setMcpHeaders(event.target.value)}
                        rows={3}
                        placeholder={'{"Authorization":"Bearer …"}'}
                      />
                    </label>
                  )}
                </div>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={mcpAction === "create" || !workspaceId}
                  onClick={() => void createMcp()}
                >
                  <Plus size={14} /> Add plugin
                </button>
                {settingsLoading ? (
                  <LoadingState label="Loading MCP plugins…" />
                ) : !mcpConnections.length ? (
                  <EmptyState
                    title="No MCP plugins connected"
                    description="Connect your Zelo or another trusted workspace MCP server above."
                  />
                ) : (
                  <div className="settings-list">
                    {mcpConnections.map((connection) => {
                      const enabled = new Set(connection.allowedToolNames);
                      return (
                        <div className="connection-card" key={connection.id}>
                          <div className="connection-card-main">
                            <div className="whatsapp-symbol">M</div>
                            <div>
                              <strong>{connection.name}</strong>
                              <span>
                                {connection.description || connection.serverUrl}
                              </span>
                              <small>
                                Status: {connection.status} ·{" "}
                                {connection.tools.length} discovered tools
                              </small>
                              {connection.lastError && (
                                <small role="alert">
                                  {connection.lastError}
                                </small>
                              )}
                            </div>
                          </div>
                          {connection.authMode === "oauth" &&
                            connection.status !== "connected" && (
                              <button
                                className="button button-secondary"
                                type="button"
                                disabled={mcpAction === connection.id}
                                onClick={() =>
                                  void startLiveMcpOAuth(
                                    workspaceId!,
                                    connection.id,
                                  )
                                    .then(({ oauthUrl }) =>
                                      window.location.assign(oauthUrl),
                                    )
                                    .catch((reason) =>
                                      onToast(
                                        reason instanceof Error
                                          ? reason.message
                                          : "OAuth could not start.",
                                      ),
                                    )
                                }
                              >
                                Authorize OAuth
                              </button>
                            )}
                          {connection.tools.length > 0 && (
                            <div className="settings-form-grid">
                              {connection.tools.map((tool) => (
                                <label key={tool.name}>
                                  <input
                                    type="checkbox"
                                    checked={enabled.has(tool.name)}
                                    disabled={mcpAction === connection.id}
                                    onChange={(event) => {
                                      const next = new Set(enabled);
                                      if (event.target.checked)
                                        next.add(tool.name);
                                      else next.delete(tool.name);
                                      void saveMcp(connection, {
                                        allowedToolNames: [...next],
                                      });
                                    }}
                                  />
                                  {tool.name}{" "}
                                  {tool.readOnly
                                    ? "(read)"
                                    : "(write — confirm risk)"}
                                </label>
                              ))}
                              <label>
                                Write access
                                <Select
                                  value={
                                    connection.writeModes.length === 2
                                      ? "both"
                                      : (connection.writeModes[0] ?? "none")
                                  }
                                  disabled={mcpAction === connection.id}
                                  options={[
                                    { value: "none", label: "None" },
                                    {
                                      value: "draft",
                                      label: "Copilot / draft",
                                    },
                                    { value: "safe_auto", label: "Auto-reply" },
                                    {
                                      value: "both",
                                      label: "Copilot and Auto-reply",
                                    },
                                  ]}
                                  onChange={(value) => {
                                    void saveMcp(connection, {
                                      writeModes:
                                        value === "both"
                                          ? ["draft", "safe_auto"]
                                          : value === "none"
                                            ? []
                                            : [value as "draft" | "safe_auto"],
                                    });
                                  }}
                                />
                              </label>
                            </div>
                          )}
                          <div className="connection-card-actions">
                            <button
                              className="button button-secondary"
                              type="button"
                              disabled={mcpAction === connection.id}
                              onClick={() => void testMcp(connection)}
                            >
                              <RefreshCw size={14} /> Test / rediscover
                            </button>
                            <button
                              className="button button-danger"
                              type="button"
                              disabled={mcpAction === connection.id}
                              onClick={() => void disconnectMcp(connection)}
                            >
                              <Trash2 size={14} /> Disconnect
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>WhatsApp connection</h2>
                    <p>
                      Live state from Whatsmiau. No sample customer or phone is
                      displayed.
                    </p>
                  </div>
                  <span className={"connection-pill " + health.tone}>
                    <span className="live-dot" /> {health.label}
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
                        <small>
                          Provider state: {selected.state} ·{" "}
                          {selected.lastEventAt
                            ? `Last event ${formatDate(selected.lastEventAt)}`
                            : "No webhook event received yet"}
                        </small>
                        {selected.historySyncComplete === false && (
                          <small className="history-sync-status">
                            Syncing history {selected.historySyncProgress ?? 0}%
                          </small>
                        )}
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

          {activeTab === "connections" && (
            <div
              id="settings-panel-connections"
              role="tabpanel"
              aria-labelledby="settings-tab-connections"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Google connections</h2>
                    <p>Choose which calendars authorized actions can use.</p>
                  </div>
                  <button
                    className="button button-ghost button-small google-connect-button"
                    type="button"
                    disabled={googleAction === "connect" || !workspaceId}
                    onClick={() => void connectGoogle()}
                  >
                    <Plus size={13} /> Connect account
                  </button>
                </div>
                {settingsError && (
                  <div className="inline-empty" role="alert">
                    <Info size={16} /> <span>{settingsError}</span>
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
                  <LoadingState label="Loading Google connections…" />
                ) : !googleConnections.length ? (
                  <EmptyState
                    title="No Google accounts connected"
                    description="Connect a Google account when OAuth credentials are configured for this server."
                  />
                ) : (
                  <div className="settings-list">
                    {googleConnections.map((connection) => {
                      const selectedCalendarIds = new Set(
                        connection.selectedCalendarIds,
                      );
                      return (
                        <div
                          className="connection-card google-connection-card"
                          key={connection.id}
                        >
                          <div className="connection-card-main">
                            <div className="whatsapp-symbol">G</div>
                            <div>
                              <strong>
                                {connection.accountName ??
                                  connection.accountEmail ??
                                  "Google account"}
                              </strong>
                              <span>
                                {connection.accountEmail ??
                                  "Email not reported"}
                              </span>
                              <small>
                                {connection.status === "connected"
                                  ? "Connected"
                                  : connection.status}{" "}
                                · {connection.calendars.length} calendar
                                {connection.calendars.length === 1 ? "" : "s"}
                              </small>
                              {connection.lastError && (
                                <small role="alert">
                                  {connection.lastError}
                                </small>
                              )}
                            </div>
                          </div>
                          {connection.calendars.length > 0 && (
                            <fieldset className="connection-calendar-list">
                              <legend>Available calendars</legend>
                              {connection.calendars.map((calendar) => (
                                <label
                                  className="connection-calendar-option"
                                  key={calendar.id}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCalendarIds.has(
                                      calendar.id,
                                    )}
                                    disabled={googleAction === connection.id}
                                    onChange={(event) => {
                                      const next = new Set(selectedCalendarIds);
                                      if (event.target.checked)
                                        next.add(calendar.id);
                                      else next.delete(calendar.id);
                                      void saveGoogleCalendars(connection, [
                                        ...next,
                                      ]);
                                    }}
                                  />
                                  <span>
                                    {calendar.summary}
                                    {calendar.primary ? " (primary)" : ""}
                                  </span>
                                </label>
                              ))}
                            </fieldset>
                          )}
                          <div className="connection-card-actions">
                            <button
                              className="button button-danger button-small"
                              type="button"
                              disabled={googleAction === connection.id}
                              onClick={() => void disconnectGoogle(connection)}
                            >
                              <Trash2 size={13} /> Disconnect
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "members" && (
            <div
              id="settings-panel-members"
              role="tabpanel"
              aria-labelledby="settings-tab-members"
            >
              <MembersPanel
                workspaceId={workspaceId}
                onToast={onToast}
                onConfirm={onConfirm}
              />
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
                      <Select
                        className="settings-inline-select"
                        ariaLabel="AI mode for live conversations"
                        value={aiMode}
                        options={[
                          { value: "draft", label: "Copilot" },
                          { value: "safe_auto", label: "Auto-reply" },
                          { value: "off", label: "Manual" },
                        ]}
                        disabled={aiSaving}
                        onChange={(value) => setAiMode(value as AiMode)}
                      />
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
                          <Select
                            ariaLabel={`AI route for ${triageIntentLabels[intent]}`}
                            value={aiPolicy.routes[intent]}
                            options={aiTriageRouteValues.map((route) => ({
                              value: route,
                              label: triageRouteLabels[route],
                            }))}
                            disabled={aiPolicySaving}
                            onChange={(value) =>
                              updateAutomationRoute(
                                intent,
                                value as AiTriageRoute,
                              )
                            }
                          />
                        </label>
                      ))}
                      <label>
                        Unknown or unmatched fallback
                        <Select
                          ariaLabel="AI fallback route"
                          value={aiPolicy.fallbackRoute}
                          options={aiTriageRouteValues.map((route) => ({
                            value: route,
                            label: triageRouteLabels[route],
                          }))}
                          disabled={aiPolicySaving}
                          onChange={(value) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    fallbackRoute: value as AiTriageRoute,
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="settings-form-grid automation-toggles">
                      <label>
                        MCP failure policy
                        <Select
                          ariaLabel="MCP failure policy"
                          value={aiPolicy.mcpFailurePolicy}
                          options={[
                            { value: "review", label: "Send to human review" },
                            {
                              value: "generic_reply",
                              label: "Generic published-knowledge reply",
                            },
                            {
                              value: "retry_then_review",
                              label: "Retry twice, then review",
                            },
                          ]}
                          disabled={aiPolicySaving}
                          onChange={(value) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    mcpFailurePolicy:
                                      value as LiveWorkspaceAiPolicy["mcpFailurePolicy"],
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.safeAutoEnabled}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    safeAutoEnabled: event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Enable safe auto-reply decisions
                      </label>
                      <label className="confidence-control">
                        Minimum confidence for safe auto-reply
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={aiPolicy.safeAutoMinConfidence}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    safeAutoMinConfidence: Math.min(
                                      1,
                                      Math.max(0, Number(event.target.value)),
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
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
                          checked={aiPolicy.bugAutoFixEnabled}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    bugAutoFixEnabled: event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Let the selected coding agent implement confirmed bugs
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={aiPolicy.bugAutoDeployEnabled}
                          disabled={aiPolicySaving}
                          onChange={(event) =>
                            setAiPolicy((current) =>
                              current
                                ? {
                                    ...current,
                                    bugAutoDeployEnabled: event.target.checked,
                                  }
                                : current,
                            )
                          }
                        />
                        Allow deployment actions after explicit approval
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
                        Allow automatic customer replies
                      </label>
                    </div>
                    <div className="safe-auto-intents">
                      <strong>Safe auto-reply eligible intents</strong>
                      <p>
                        Only these intent types can send automatically when all
                        other policy gates pass.
                      </p>
                      <div className="settings-form-grid automation-toggles">
                        {triageIntentValues.map((intent) => (
                          <label key={intent}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.safeAutoIntents.includes(
                                intent,
                              )}
                              disabled={aiPolicySaving}
                              aria-label={`Safe auto-reply intent ${triageIntentLabels[intent]}`}
                              onChange={(event) =>
                                setAiPolicy((current) => {
                                  if (!current) return current;
                                  const safeAutoIntents = event.target.checked
                                    ? [
                                        ...new Set([
                                          ...current.safeAutoIntents,
                                          intent,
                                        ]),
                                      ]
                                    : current.safeAutoIntents.filter(
                                        (value) => value !== intent,
                                      );
                                  return { ...current, safeAutoIntents };
                                })
                              }
                            />
                            {triageIntentLabels[intent]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="settings-section-header settings-subsection-header">
                      <div>
                        <h3>Workspace AI autonomy</h3>
                        <p>
                          Each workspace chooses the channels, integrations and
                          capabilities available to its AI. Publication,
                          deployment and deletion always remain behind human
                          approval; implementation can be automated only when
                          explicitly allowed below.
                        </p>
                      </div>
                    </div>
                    <div className="settings-form-grid automation-toggles">
                      <div>
                        <strong>Allowed channels</strong>
                        {aiPolicyChannelValues.map((channel) => (
                          <label key={channel}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.allowedChannels.includes(
                                channel,
                              )}
                              disabled={aiPolicySaving}
                              onChange={(event) =>
                                togglePolicyValue(
                                  "allowedChannels",
                                  channel,
                                  event.target.checked,
                                )
                              }
                            />
                            {aiPolicyChannelLabels[channel]}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>Allowed integrations</strong>
                        {aiPolicyIntegrationValues.map((integration) => (
                          <label key={integration}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.allowedIntegrations.includes(
                                integration,
                              )}
                              disabled={aiPolicySaving}
                              onChange={(event) =>
                                togglePolicyValue(
                                  "allowedIntegrations",
                                  integration,
                                  event.target.checked,
                                )
                              }
                            />
                            {aiPolicyIntegrationLabels[integration]}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>Allowed AI actions</strong>
                        {aiPolicyActionValues.map((action) => (
                          <label key={action}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.allowedActions.includes(action)}
                              disabled={aiPolicySaving}
                              onChange={(event) =>
                                togglePolicyValue(
                                  "allowedActions",
                                  action,
                                  event.target.checked,
                                )
                              }
                            />
                            {aiPolicyActionLabels[action]}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>Human approval required</strong>
                        {aiPolicyActionValues.map((action) => (
                          <label key={action}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.humanApprovalActions.includes(
                                action,
                              )}
                              disabled={
                                aiPolicySaving ||
                                action === "publish" ||
                                action === "deploy" ||
                                action === "delete"
                              }
                              onChange={(event) =>
                                togglePolicyValue(
                                  "humanApprovalActions",
                                  action,
                                  event.target.checked,
                                )
                              }
                            />
                            {aiPolicyActionLabels[action]}
                          </label>
                        ))}
                      </div>
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

          {activeTab === "flows" && (
            <div
              id="settings-panel-flows"
              role="tabpanel"
              aria-labelledby="settings-tab-flows"
            >
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>Support flow</h2>
                    <p>
                      Build the first WhatsApp steps visually. Mend sends the
                      menu and follows the customer&apos;s choice before AI or a
                      human takes over.
                    </p>
                  </div>
                  <span className="section-count">
                    {flow?.nodes.length ?? 0} steps
                  </span>
                </div>
                {!workspaceId || !selected?.channelId ? (
                  <div className="inline-empty">
                    <MessageCircle size={16} />
                    <span>
                      Connect a WhatsApp number before configuring its flow.
                    </span>
                  </div>
                ) : settingsLoading || !flow ? (
                  <LoadingState label="Loading support flow..." />
                ) : (
                  <>
                    <div className="flow-settings-row">
                      <label className="toggle-field">
                        <input
                          type="checkbox"
                          checked={flow.enabled}
                          onChange={(event) =>
                            updateFlow((current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>Enable this flow</strong>
                          <small>
                            When enabled, it runs before AI triage on new chats.
                          </small>
                        </span>
                      </label>
                      <label>
                        Start flow when
                        <Select
                          ariaLabel="Flow trigger"
                          value={flow.trigger.type}
                          options={[
                            {
                              value: "first_message",
                              label: "A new chat starts",
                            },
                            {
                              value: "keywords",
                              label: "A keyword is detected",
                            },
                          ]}
                          onChange={(value) =>
                            updateFlow((current) => ({
                              ...current,
                              trigger: {
                                ...current.trigger,
                                type: value as "first_message" | "keywords",
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                    {flow.trigger.type === "keywords" && (
                      <label className="flow-keywords-field">
                        Keywords
                        <input
                          value={flow.trigger.keywords.join(", ")}
                          onChange={(event) =>
                            updateFlow((current) => ({
                              ...current,
                              trigger: {
                                ...current.trigger,
                                keywords: event.target.value
                                  .split(",")
                                  .map((value) => value.trim())
                                  .filter(Boolean),
                              },
                            }))
                          }
                          placeholder="preço, pedido, ajuda"
                        />
                        <small>Separate keywords with commas.</small>
                      </label>
                    )}
                    <div className="flow-builder">
                      <aside className="flow-node-list" aria-label="Flow steps">
                        <div className="flow-node-list-header">
                          <strong>Steps</strong>
                          <button
                            className="icon-button subtle"
                            type="button"
                            aria-label="Add flow step"
                            onClick={addFlowNode}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        {flow.nodes.map((node, index) => (
                          <button
                            className={`flow-node-item ${selectedFlowNode?.id === node.id ? "selected" : ""}`}
                            type="button"
                            key={node.id}
                            onClick={() => setFlowNodeId(node.id)}
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{node.title}</strong>
                            <small>
                              {node.type === "menu"
                                ? `${node.options.length} options`
                                : node.type === "handoff"
                                  ? "Human handoff"
                                  : "Message"}
                            </small>
                          </button>
                        ))}
                      </aside>
                      {selectedFlowNode && (
                        <div className="flow-node-editor">
                          <div className="flow-node-editor-header">
                            <div>
                              <span className="eyebrow">Selected step</span>
                              <h3>{selectedFlowNode.title}</h3>
                            </div>
                            {flow.nodes.length > 1 && (
                              <button
                                className="text-button danger-text-button"
                                type="button"
                                onClick={() => {
                                  updateFlow((current) => ({
                                    ...current,
                                    rootNodeId:
                                      current.rootNodeId === selectedFlowNode.id
                                        ? (current.nodes.find(
                                            (node) =>
                                              node.id !== selectedFlowNode.id,
                                          )?.id ?? current.rootNodeId)
                                        : current.rootNodeId,
                                    nodes: current.nodes.filter(
                                      (node) => node.id !== selectedFlowNode.id,
                                    ),
                                  }));
                                  setFlowNodeId(undefined);
                                }}
                              >
                                <Trash2 size={13} /> Remove step
                              </button>
                            )}
                          </div>
                          <div className="settings-form-grid flow-node-fields">
                            <label>
                              Step name
                              <input
                                value={selectedFlowNode.title}
                                onChange={(event) =>
                                  updateFlow((current) => ({
                                    ...current,
                                    nodes: current.nodes.map((node) =>
                                      node.id === selectedFlowNode.id
                                        ? { ...node, title: event.target.value }
                                        : node,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Step type
                              <Select
                                ariaLabel="Flow step type"
                                value={selectedFlowNode.type}
                                options={[
                                  { value: "menu", label: "Menu with choices" },
                                  { value: "message", label: "Send a message" },
                                  {
                                    value: "handoff",
                                    label: "Hand off to a human",
                                  },
                                ]}
                                onChange={(value) =>
                                  updateFlow((current) => ({
                                    ...current,
                                    nodes: current.nodes.map((node) =>
                                      node.id === selectedFlowNode.id
                                        ? {
                                            ...node,
                                            type: value as
                                              | "menu"
                                              | "message"
                                              | "handoff",
                                            options:
                                              value === "menu"
                                                ? node.options
                                                : [],
                                          }
                                        : node,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <label>
                            Message
                            <textarea
                              value={selectedFlowNode.message}
                              onChange={(event) =>
                                updateFlow((current) => ({
                                  ...current,
                                  nodes: current.nodes.map((node) =>
                                    node.id === selectedFlowNode.id
                                      ? { ...node, message: event.target.value }
                                      : node,
                                  ),
                                }))
                              }
                              rows={4}
                              placeholder="What should the customer see?"
                            />
                          </label>
                          {selectedFlowNode.type === "menu" && (
                            <div className="flow-options-editor">
                              <div className="flow-options-header">
                                <div>
                                  <strong>Choices</strong>
                                  <small>
                                    Use up to 3 buttons or a list for more
                                    choices.
                                  </small>
                                </div>
                                <button
                                  className="button button-ghost"
                                  type="button"
                                  disabled={
                                    selectedFlowNode.options.length >= 10
                                  }
                                  onClick={() =>
                                    updateFlow((current) => ({
                                      ...current,
                                      nodes: current.nodes.map((node) =>
                                        node.id === selectedFlowNode.id
                                          ? {
                                              ...node,
                                              options: [
                                                ...node.options,
                                                {
                                                  id: `option-${Date.now()}`,
                                                  label: "New choice",
                                                },
                                              ],
                                            }
                                          : node,
                                      ),
                                    }))
                                  }
                                >
                                  <Plus size={14} /> Add choice
                                </button>
                              </div>
                              {selectedFlowNode.options.map((option) => (
                                <div
                                  className="flow-option-row"
                                  key={option.id}
                                >
                                  <input
                                    aria-label={`Choice ${option.label}`}
                                    value={option.label}
                                    onChange={(event) =>
                                      updateFlow((current) => ({
                                        ...current,
                                        nodes: current.nodes.map((node) =>
                                          node.id === selectedFlowNode.id
                                            ? {
                                                ...node,
                                                options: node.options.map(
                                                  (item) =>
                                                    item.id === option.id
                                                      ? {
                                                          ...item,
                                                          label:
                                                            event.target.value,
                                                        }
                                                      : item,
                                                ),
                                              }
                                            : node,
                                        ),
                                      }))
                                    }
                                  />
                                  <Select
                                    ariaLabel={`Next step for ${option.label}`}
                                    value={option.nextNodeId ?? ""}
                                    options={[
                                      {
                                        value: "",
                                        label: "End or wait for human",
                                      },
                                      ...flow.nodes
                                        .filter(
                                          (node) =>
                                            node.id !== selectedFlowNode.id,
                                        )
                                        .map((node) => ({
                                          value: node.id,
                                          label: node.title,
                                        })),
                                    ]}
                                    onChange={(value) =>
                                      updateFlow((current) => ({
                                        ...current,
                                        nodes: current.nodes.map((node) =>
                                          node.id === selectedFlowNode.id
                                            ? {
                                                ...node,
                                                options: node.options.map(
                                                  (item) =>
                                                    item.id === option.id
                                                      ? {
                                                          ...item,
                                                          ...(value
                                                            ? {
                                                                nextNodeId:
                                                                  value,
                                                              }
                                                            : {
                                                                nextNodeId:
                                                                  undefined,
                                                              }),
                                                        }
                                                      : item,
                                                ),
                                              }
                                            : node,
                                        ),
                                      }))
                                    }
                                  />
                                  <button
                                    className="icon-button subtle"
                                    type="button"
                                    aria-label={`Remove choice ${option.label}`}
                                    disabled={
                                      selectedFlowNode.options.length <= 1
                                    }
                                    onClick={() =>
                                      updateFlow((current) => ({
                                        ...current,
                                        nodes: current.nodes.map((node) =>
                                          node.id === selectedFlowNode.id
                                            ? {
                                                ...node,
                                                options: node.options.filter(
                                                  (item) =>
                                                    item.id !== option.id,
                                                ),
                                              }
                                            : node,
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={flowSaving}
                      onClick={() => void saveFlow()}
                    >
                      <Save size={14} />{" "}
                      {flowSaving ? "Saving..." : "Save support flow"}
                    </button>
                  </>
                )}
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
                      Attach the workspace to GitHub once, then choose which
                      repositories Mend can work with.
                    </p>
                  </div>
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={repositoriesLoading || !workspaceId}
                    onClick={() => void loadRepositories()}
                  >
                    <RefreshCw size={14} />
                    {repositoriesLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <div
                  className={`github-space-card ${githubConnection.connected ? "is-connected" : ""}`}
                >
                  <div className="github-space-signal" aria-hidden="true" />
                  <div className="github-space-content">
                    <div className="github-space-header">
                      <div className="github-space-identity">
                        <span className="github-space-mark">
                          <Github size={18} />
                        </span>
                        <div>
                          <span className="github-space-eyebrow">
                            Workspace GitHub space
                          </span>
                          <h3>
                            {githubConnection.connected
                              ? githubConnection.owner
                              : "Connect a GitHub account"}
                          </h3>
                          <p>
                            {githubConnection.connected
                              ? "This account is the source for repository selection and publishing access."
                              : "Give this workspace a GitHub installation to enable repository selection and publishing."}
                          </p>
                        </div>
                      </div>
                      {githubConnection.connected ? (
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={githubAction !== null}
                          onClick={() => void disconnectWorkspaceGitHub()}
                        >
                          <Link2 size={13} />
                          {githubAction === "disconnect"
                            ? "Disconnecting..."
                            : "Disconnect"}
                        </button>
                      ) : (
                        <button
                          className="button button-primary button-small"
                          type="button"
                          disabled={githubAction !== null || !workspaceId}
                          onClick={() => void connectWorkspaceGitHub()}
                        >
                          <Github size={13} />
                          {githubAction === "connect"
                            ? "Opening GitHub..."
                            : "Connect GitHub"}
                        </button>
                      )}
                    </div>
                    {githubConnection.connected ? (
                      <div className="github-space-stats">
                        <span>
                          <strong>{githubRepositories.length}</strong>{" "}
                          repositories available
                        </span>
                        <span>Owner is read-only after connection</span>
                      </div>
                    ) : (
                      <div className="github-space-empty">
                        <Info size={14} />
                        <span>
                          The GitHub owner is filled by the connected account;
                          it cannot be edited here.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="settings-section settings-section-inset">
                  <div className="settings-section-header">
                    <div>
                      <h3>LLM provider credentials</h3>
                      <p>
                        Keys are encrypted server-side and injected only into
                        the selected Agent process. They are never returned to
                        this page.
                      </p>
                    </div>
                  </div>
                  <div className="settings-form-grid">
                    <label>
                      Task
                      <Select
                        value={credentialTask}
                        options={[
                          { value: "agent", label: "Agent runs" },
                          { value: "support", label: "Support AI" },
                        ]}
                        onChange={(value) =>
                          setCredentialTask(value as "support" | "agent")
                        }
                      />
                    </label>
                    <label>
                      Provider
                      <Select
                        value={credentialProvider}
                        options={[
                          { value: "openai", label: "ChatGPT" },
                          { value: "anthropic", label: "Claude" },
                          { value: "google", label: "Gemini" },
                          { value: "verboo", label: "Verboo" },
                        ]}
                        onChange={(value) =>
                          setCredentialProvider(value as CodingAgentProvider)
                        }
                      />
                    </label>
                    <label className="settings-form-wide">
                      API key
                      <input
                        type="password"
                        value={credentialKey}
                        autoComplete="new-password"
                        placeholder="Paste a provider key"
                        onChange={(event) =>
                          setCredentialKey(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={credentialSaving || !credentialKey.trim()}
                    onClick={() => void saveCredential()}
                  >
                    <Save size={14} />
                    {credentialSaving
                      ? "Saving securely..."
                      : "Save credential"}
                  </button>
                  {agentCredentials.length > 0 && (
                    <div className="credential-list">
                      {agentCredentials.map((credential) => (
                        <div
                          className="credential-row"
                          key={`${credential.task}:${credential.provider}`}
                        >
                          <span>
                            {credential.task === "agent" ? "Agent" : "Support"}{" "}
                            ·{" "}
                            {credential.provider === "openai"
                              ? "ChatGPT"
                              : credential.provider === "anthropic"
                                ? "Claude"
                                : credential.provider === "google"
                                  ? "Gemini"
                                  : "Verboo"}
                          </span>
                          <button
                            className="text-button danger"
                            type="button"
                            disabled={credentialSaving}
                            onClick={() => void removeCredential(credential)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="settings-section settings-section-inset coding-control-plane">
                  <div className="settings-section-header">
                    <div>
                      <h3>Coding connections</h3>
                      <p>
                        Connect provider API keys or your personal OpenAI/Gemini
                        subscription. Subscription use in automations requires
                        separate owner consent.
                      </p>
                    </div>
                    <Bot size={18} aria-hidden="true" />
                  </div>
                  <div className="settings-form-grid">
                    <label>
                      Connection label
                      <input
                        value={codingConnectionLabel}
                        onChange={(event) =>
                          setCodingConnectionLabel(event.target.value)
                        }
                        placeholder="Research Claude API"
                      />
                    </label>
                    <label>
                      Provider
                      <Select
                        value={codingConnectionProvider}
                        options={[
                          { value: "openai", label: "OpenAI / Codex" },
                          { value: "anthropic", label: "Anthropic / Claude" },
                          { value: "google", label: "Google / Gemini" },
                          { value: "verboo", label: "Verboo" },
                        ]}
                        onChange={(value) =>
                          setCodingConnectionProvider(
                            value as CodingAgentProvider,
                          )
                        }
                      />
                    </label>
                    <label>
                      Authentication
                      <Select
                        value={codingConnectionAuthMethod}
                        options={[
                          { value: "api_key", label: "API key" },
                          {
                            value: "subscription",
                            label: "Personal subscription",
                            disabled:
                              codingConnectionProvider === "anthropic" ||
                              codingConnectionProvider === "google",
                          },
                        ]}
                        onChange={(value) =>
                          setCodingConnectionAuthMethod(
                            value as "api_key" | "subscription",
                          )
                        }
                      />
                    </label>
                    {codingConnectionAuthMethod === "api_key" && (
                      <label className="settings-form-wide">
                        API key
                        <input
                          type="password"
                          value={codingConnectionKey}
                          autoComplete="new-password"
                          placeholder="Stored encrypted and never returned"
                          onChange={(event) =>
                            setCodingConnectionKey(event.target.value)
                          }
                        />
                      </label>
                    )}
                  </div>
                  {codingConnectionAuthMethod === "subscription" && (
                    <>
                      <p className="settings-field-help">
                        OpenAI uses the official Codex device-auth flow. Gemini
                        subscription login is disabled until this headless
                        runner can complete the official interactive flow.
                        Claude.ai login is disabled because Mend hosted runners
                        cannot intermediate Pro/Max credentials.
                      </p>
                      {codingConnectionProvider === "openai" && (
                        <div className="coding-auth-tutorial">
                          <strong>Connect your ChatGPT subscription</strong>
                          <ol>
                            <li>
                              <a
                                href="https://chatgpt.com/#settings/Security"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Enable ChatGPT authorization here
                              </a>
                              <span> in Security &amp; login.</span>
                            </li>
                            <li>Turn on “Authorize device code for Codex”.</li>
                            <li>
                              Return to Mend and click “Start official login”.
                            </li>
                            <li>
                              Open the official login link and enter the
                              one-time code shown here.
                            </li>
                          </ol>
                          <p>
                            The code is private. Never share it in chat or with
                            anyone who asks for it.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={
                      codingSaving ||
                      !workspaceId ||
                      !codingConnectionLabel.trim() ||
                      (codingConnectionAuthMethod === "api_key" &&
                        !codingConnectionKey.trim())
                    }
                    onClick={() => void saveCodingConnection()}
                  >
                    <Save size={14} />
                    {codingConnectionAuthMethod === "subscription"
                      ? "Start official login"
                      : "Save coding connection"}
                  </button>
                  {codingLoginJob && (
                    <div className="inline-empty coding-login-challenge">
                      <Info size={15} />
                      <div>
                        <strong>Complete the provider login</strong>
                        {codingLoginJob.url && (
                          <a
                            href={codingLoginJob.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open official login
                          </a>
                        )}
                        {codingLoginJob.code && (
                          <code>{codingLoginJob.code}</code>
                        )}
                        <span>
                          Status: {codingLoginJob.status}
                          {codingLoginJob.errorCode
                            ? ` · ${codingLoginJob.errorCode}`
                            : ""}
                        </span>
                        {![
                          "completed",
                          "failed",
                          "canceled",
                          "expired",
                        ].includes(codingLoginJob.status) && (
                          <button
                            className="text-button danger"
                            type="button"
                            onClick={() =>
                              workspaceId &&
                              void cancelLiveAgentLogin({
                                workspaceId,
                                jobId: codingLoginJob.id,
                              }).then(setCodingLoginJob)
                            }
                          >
                            Cancel login
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="coding-connection-list">
                    {codingConnections.map((connection) => (
                      <div
                        className="coding-connection-row"
                        key={connection.id}
                      >
                        <div>
                          <strong>{connection.label}</strong>
                          <p>
                            {agentProviderLabel(connection.provider)} ·{" "}
                            {connection.authMethod === "subscription"
                              ? "personal subscription"
                              : "API key"}
                            {connection.catalog
                              ? ` · catalog verified ${new Date(
                                  connection.catalog.lastVerifiedAt,
                                ).toLocaleString()}`
                              : " · catalog not verified"}
                          </p>
                          {connection.authMethod === "subscription" && (
                            <label className="coding-consent">
                              <input
                                type="checkbox"
                                checked={connection.automationConsent}
                                onChange={(event) =>
                                  void updateCodingConsent(
                                    connection,
                                    event.target.checked,
                                  )
                                }
                              />
                              Allow this subscription in automations
                            </label>
                          )}
                        </div>
                        <div className="repository-row-trailing">
                          <span
                            className={`connection-pill ${connection.status}`}
                          >
                            {connection.status}
                          </span>
                          <button
                            className="text-button"
                            type="button"
                            disabled={codingSaving}
                            onClick={() =>
                              void refreshCodingCatalog(connection)
                            }
                          >
                            <RefreshCw size={13} /> Catalog
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            disabled={codingSaving}
                            onClick={() =>
                              void refreshCodingConnection(connection)
                            }
                          >
                            Verify
                          </button>
                          <button
                            className="text-button danger"
                            type="button"
                            disabled={
                              codingSaving || connection.status === "revoked"
                            }
                            onClick={() =>
                              void revokeCodingConnection(connection)
                            }
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                    {!codingConnections.length && (
                      <div className="inline-empty">
                        <Bot size={15} />
                        <span>No coding connections configured yet.</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="settings-section settings-section-inset coding-routing-matrix">
                  <div className="settings-section-header">
                    <div>
                      <h3>Routing by coding stage</h3>
                      <p>
                        Policies resolve as run override, repository, then
                        workspace. A model must come from a verified catalog;
                        fallback is opt-in and explicit.
                      </p>
                    </div>
                  </div>
                  <div className="coding-policy-table">
                    {(
                      ["research", "implement", "review", "verify"] as const
                    ).map((stage) => {
                      const policy = codingPolicyFor(stage);
                      const connection = codingConnections.find(
                        (item) => item.id === policy.connectionId,
                      );
                      const models = connection?.catalog?.models ?? [];
                      const selectedModel = models.find(
                        (model) => model.id === policy.model,
                      );
                      const efforts = selectedModel?.efforts ?? [];
                      return (
                        <div className="coding-policy-row" key={stage}>
                          <strong>{stage}</strong>
                          <Select
                            ariaLabel={`${stage} connection`}
                            value={policy.connectionId ?? ""}
                            options={[
                              { value: "", label: "Select connection" },
                              ...codingConnections.map((item) => ({
                                value: item.id,
                                label: `${item.label} · ${agentProviderLabel(item.provider)}`,
                                disabled: item.status !== "connected",
                              })),
                            ]}
                            onChange={(value) =>
                              updateCodingPolicy(stage, {
                                connectionId: value || undefined,
                                model: undefined,
                                effort: undefined,
                              })
                            }
                          />
                          <Select
                            ariaLabel={`${stage} model`}
                            value={policy.model ?? ""}
                            options={
                              models.length
                                ? models.map((model) => ({
                                    value: model.id,
                                    label: model.label ?? model.id,
                                  }))
                                : [
                                    {
                                      value: "",
                                      label: "Refresh verified catalog",
                                      disabled: true,
                                    },
                                  ]
                            }
                            disabled={!models.length}
                            onChange={(value) =>
                              updateCodingPolicy(stage, {
                                model: value || undefined,
                                effort: undefined,
                              })
                            }
                          />
                          {efforts.length ? (
                            <Select
                              ariaLabel={`${stage} effort`}
                              value={policy.effort ?? ""}
                              options={[
                                { value: "", label: "Default effort" },
                                ...efforts.map((effort) => ({
                                  value: effort,
                                  label: effort,
                                })),
                              ]}
                              onChange={(value) =>
                                updateCodingPolicy(stage, {
                                  effort: value || undefined,
                                })
                              }
                            />
                          ) : (
                            <span className="settings-field-help">
                              No effort capability
                            </span>
                          )}
                          <label className="coding-fallback-toggle">
                            <input
                              type="checkbox"
                              checked={policy.fallbackEnabled === true}
                              onChange={(event) =>
                                updateCodingPolicy(stage, {
                                  fallbackEnabled: event.target.checked,
                                })
                              }
                            />
                            fallback
                          </label>
                          {policy.fallbackEnabled && (
                            <select
                              className="coding-fallback-select"
                              multiple
                              aria-label={`${stage} fallback connections`}
                              value={policy.fallbackConnectionIds ?? []}
                              onChange={(event) =>
                                updateCodingPolicy(stage, {
                                  fallbackConnectionIds: Array.from(
                                    event.target.selectedOptions,
                                    (option) => option.value,
                                  ),
                                })
                              }
                            >
                              {codingConnections
                                .filter(
                                  (item) => item.id !== policy.connectionId,
                                )
                                .map((item) => (
                                  <option
                                    key={item.id}
                                    value={item.id}
                                    disabled={item.status !== "connected"}
                                  >
                                    {item.label}
                                  </option>
                                ))}
                            </select>
                          )}
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => void saveCodingPolicy(stage)}
                          >
                            <Save size={13} /> Save
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {repositoriesLoading ? (
                  <LoadingState label="Loading repositories..." />
                ) : repositoriesError ? (
                  <div className="inline-empty" role="alert">
                    <Info size={16} />
                    <span>{repositoriesError}</span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void loadRepositories()}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {repositories.map((repository) => (
                      <div className="repository-row" key={repository.id}>
                        <div className="repository-row-main">
                          <div className="repository-row-heading">
                            <GitBranch size={15} />
                            <strong>{repository.name}</strong>
                          </div>
                          <p>
                            {agentProviderLabel(repository.agentProvider)} ·{" "}
                            {repository.executionPlane === "github_actions"
                              ? "GitHub Actions"
                              : "Dokploy runner"}{" "}
                            · {repository.defaultBranch}
                          </p>
                          {repository.githubOwner && repository.githubRepo && (
                            <p className="repository-row-github">
                              <Github size={12} /> {repository.githubOwner}/
                              {repository.githubRepo}
                            </p>
                          )}
                        </div>
                        <div className="repository-row-trailing">
                          {repository.githubInstallationId &&
                          githubConnection.connected ? (
                            <span className="connection-pill">
                              <Github size={13} /> Connected
                            </span>
                          ) : repository.githubOwner &&
                            repository.githubRepo ? (
                            <span className="repository-status muted">
                              GitHub needs connection
                            </span>
                          ) : (
                            <span className="repository-status">
                              GitHub not selected
                            </span>
                          )}
                          <ActionMenu label={repository.name}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => editRepository(repository)}
                            >
                              <PenLine size={14} /> Edit
                            </button>
                            <button
                              className="danger"
                              type="button"
                              role="menuitem"
                              onClick={() => void removeRepository(repository)}
                            >
                              <Trash2 size={14} /> Remove
                            </button>
                          </ActionMenu>
                        </div>
                      </div>
                    ))}
                    {!repositories.length && (
                      <div className="inline-empty">
                        <GitBranch size={16} />
                        <span>
                          No repositories configured for this workspace.
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="repository-editor" id="repository-editor">
                  <div className="repository-editor-header">
                    <div>
                      <span className="github-space-eyebrow">
                        {editingRepositoryId
                          ? "Repository settings"
                          : "New repository"}
                      </span>
                      <h3>
                        {editingRepositoryId
                          ? "Edit repository"
                          : "Add a repository"}
                      </h3>
                    </div>
                    {editingRepositoryId && (
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={resetRepositoryForm}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
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
                      Agent / LLM provider
                      <Select
                        value={repositoryAgent}
                        options={[
                          { value: "openai", label: "ChatGPT" },
                          { value: "anthropic", label: "Claude" },
                          { value: "google", label: "Gemini" },
                          { value: "verboo", label: "Verboo" },
                        ]}
                        onChange={(value) =>
                          setRepositoryAgent(value as CodingAgentProvider)
                        }
                      />
                    </label>
                    <label>
                      Execution plane
                      <input
                        value="Dokploy runner + GitHub control plane"
                        disabled
                      />
                      <small className="settings-field-help">
                        The Agent runs in a private ephemeral workspace; GitHub
                        owns branches, pull requests, checks, and release gates.
                      </small>
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
                    <label>
                      GitHub owner
                      <input
                        value={githubConnection.owner ?? githubOwner}
                        readOnly
                        placeholder="Connect GitHub first"
                      />
                      <small className="settings-field-help">
                        Filled by the workspace GitHub connection.
                      </small>
                    </label>
                    <label>
                      GitHub repository
                      <Select
                        value={
                          githubRepo
                            ? `${githubOwner || githubConnection.owner}/${githubRepo}`
                            : ""
                        }
                        options={[
                          {
                            value: "",
                            label: githubRepositoriesLoading
                              ? "Loading repositories..."
                              : githubConnection.connected
                                ? "No GitHub repository"
                                : "Connect GitHub first",
                            disabled: true,
                          },
                          ...githubRepositories.map((option) => ({
                            value: `${option.owner}/${option.repo}`,
                            label: `${option.owner}/${option.repo}`,
                          })),
                        ]}
                        disabled={
                          !githubConnection.connected ||
                          githubRepositoriesLoading
                        }
                        onChange={(value) => {
                          const option = githubRepositories.find(
                            (item) => `${item.owner}/${item.repo}` === value,
                          );
                          setGithubOwner(
                            option?.owner ?? githubConnection.owner ?? "",
                          );
                          setGithubRepo(option?.repo ?? "");
                          if (option) {
                            setRepositoryBranch(option.defaultBranch);
                            if (!repositoryName.trim())
                              setRepositoryName(option.repo);
                          }
                        }}
                      />
                      <small className="settings-field-help">
                        Select from repositories available to this GitHub App.
                      </small>
                    </label>
                  </div>
                  <div className="repository-form-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={
                        channelAction ||
                        !workspaceId ||
                        !repositoryName.trim() ||
                        !githubRepo.trim()
                      }
                      onClick={() => void saveRepository()}
                    >
                      {editingRepositoryId ? (
                        <Save size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                      {editingRepositoryId ? "Save changes" : "Add repository"}
                    </button>
                  </div>
                </div>
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
