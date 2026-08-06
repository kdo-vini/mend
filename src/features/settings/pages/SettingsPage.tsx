import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  ChevronRight,
  GitBranch,
  Info,
  Link2,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { AiMode } from "../../../types";
import { currentInterfaceLanguage } from "../../../i18n/preferences";
import type { GoogleConnection, McpConnection, WhatsAppInstance } from "../api";
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
import { MembersPanel } from "../components/MembersPanel";
import { localizedError } from "../../../shared/ui/localizedError";

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
  const triageIntentLabel = (intent: TriageIntent) => t(`ai.intents.${intent}`);
  const triageRouteLabel = (route: AiTriageRoute) => t(`ai.routes.${route}`);
  const aiPolicyActionLabel = (action: AiPolicyAction) =>
    t(`ai.actions.${action}`);
  const aiPolicyChannelLabel = (channel: AiPolicyChannel) =>
    t(`ai.channels.${channel}`);
  const aiPolicyIntegrationLabel = (integration: AiPolicyIntegration) =>
    t(`ai.integrations.${integration}`);
  const providerStateLabel = (state: string) =>
    t(`whatsapp.states.${state}`, { defaultValue: state });
  const googleStatusLabel = (status: GoogleConnection["status"]) =>
    t(`google.statuses.${status}`, { defaultValue: status });
  const mcpStatusLabel = (status: McpConnection["status"]) =>
    t(`mcp.statuses.${status}`, { defaultValue: status });
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
      localPath: string;
      defaultBranch: string;
    }>
  >([]);
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [repositoryBranch, setRepositoryBranch] = useState("main");
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
      setChannelError(localizedError(reason, t("errors.whatsappUnavailable")));
    } finally {
      setLoading(false);
    }
  }, [
    onChannelChange,
    selected?.channelId,
    selected?.instanceName,
    t,
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
          onToast(t("toasts.whatsappConnected"));
          return;
        }
        if (next.state === "closed") {
          setQr(null);
          onToast(t("toasts.whatsappPairingExpired"));
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
    t,
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
      setSettingsError(localizedError(reason, t("errors.settingsLoad")));
    } finally {
      setSettingsLoading(false);
    }
  }, [activeTab, selected?.channelId, t, workspaceId]);

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
          onToast(localizedError(reason, t("errors.repositoriesLoad")));
      });
    return () => {
      active = false;
    };
  }, [activeTab, onToast, t, workspaceId]);

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
      onToast(t("toasts.connectionRequestSent"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.connectWhatsApp")));
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
      onToast(t("toasts.whatsappInstanceCreated"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.createWhatsAppInstance")));
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
      onToast(t("toasts.whatsappDisconnected"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.disconnectWhatsApp")));
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
      onToast(localizedError(reason, t("errors.qrUnavailable")));
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
      onToast(t("toasts.repositoryConfigured"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.repositoryCreate")));
    } finally {
      setChannelAction(false);
    }
  };

  const saveAiPolicy = async () => {
    if (!workspaceId || !aiPolicy?.totalConversations) return;
    if (
      aiMode === "safe_auto" &&
      !(await onConfirm({
        title: t("confirmations.enableAutoReplyTitle"),
        description: t("confirmations.enableAutoReplyDescription"),
        confirmLabel: t("confirmations.enableAutoReplyConfirm"),
      }))
    )
      return;
    setAiSaving(true);
    try {
      const result = await saveLiveConversationAiPolicy(workspaceId, aiMode);
      if (result.updatedCount === 0) onToast(t("toasts.noLiveConversations"));
      else {
        onToast(t("toasts.aiModeSaved", { count: result.updatedCount }));
        await loadSettingsData();
      }
    } catch (reason) {
      onToast(localizedError(reason, t("errors.aiSave")));
    } finally {
      setAiSaving(false);
    }
  };

  const saveAutomationPolicy = async () => {
    if (!workspaceId || !aiPolicy) return;
    if (
      aiPolicy.safeAutoSendEnabled &&
      !(await onConfirm({
        title: t("confirmations.automaticRepliesTitle"),
        description: t("confirmations.automaticRepliesDescription"),
        confirmLabel: t("confirmations.automaticRepliesConfirm"),
      }))
    )
      return;
    setAiPolicySaving(true);
    try {
      await saveLiveWorkspaceAiPolicy(workspaceId, aiPolicy);
      onToast(t("toasts.workspaceAiRoutingSaved"));
      await loadSettingsData();
    } catch (reason) {
      onToast(localizedError(reason, t("errors.workspaceAiSave")));
    } finally {
      setAiPolicySaving(false);
    }
  };

  const togglePolicyValue = (
    field: "allowedChannels" | "allowedIntegrations" | "allowedActions",
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
      onToast(localizedError(reason, t("errors.googleOAuth")));
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
      onToast(t("toasts.googleCalendarSelectionSaved"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.googleCalendarSave")));
    } finally {
      setGoogleAction(null);
    }
  };

  const disconnectGoogle = async (connection: GoogleConnection) => {
    if (!workspaceId) return;
    if (
      !(await onConfirm({
        title: t("confirmations.disconnectGoogleTitle"),
        description: t("confirmations.disconnectGoogleDescription", {
          account: connection.accountEmail ?? t("google.account"),
        }),
        confirmLabel: t("confirmations.disconnectLabel"),
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
      onToast(t("toasts.googleAccountDisconnected"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.googleDisconnect")));
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
      else throw new Error("invalid_mcp_headers");
    } catch (error) {
      onToast(localizedError(error, t("errors.mcpHeadersInvalid")));
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
      onToast(t("toasts.mcpConnected"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.mcpConnect")));
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
      onToast(t("toasts.mcpToolsDiscovered", { count: updated.tools.length }));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.mcpTest")));
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
        title: t("confirmations.allowMcpWritesTitle"),
        description: t("confirmations.allowMcpWritesDescription"),
        confirmLabel: t("confirmations.allowWrites"),
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
      onToast(localizedError(reason, t("errors.mcpSave")));
    } finally {
      setMcpAction(null);
    }
  };

  const disconnectMcp = async (connection: McpConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("confirmations.disconnectMcpTitle"),
        description: t("confirmations.disconnectMcpDescription"),
        confirmLabel: t("confirmations.disconnectLabel"),
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
      onToast(t("toasts.mcpDisconnected"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.mcpDisconnect")));
    } finally {
      setMcpAction(null);
    }
  };

  const saveFlow = async () => {
    if (!workspaceId || !selected?.channelId || !flow) return;
    const parsed = supportFlowSchema.safeParse(flow);
    if (!parsed.success) {
      onToast(t("errors.flowInvalid"));
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
      onToast(t("toasts.supportFlowSaved"));
    } catch (reason) {
      onToast(localizedError(reason, t("errors.flowSave")));
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
            title: t("flow.newStep"),
            type: "message",
            message: t("flow.newStepMessage"),
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
      return { label: t("whatsapp.healthOffline"), tone: "offline" };
    if (!selected.lastEventAt)
      return { label: t("whatsapp.healthConnected"), tone: "connected" };
    const age = Date.now() - new Date(selected.lastEventAt).getTime();
    return age > 90_000
      ? { label: t("whatsapp.healthNeedsAttention"), tone: "warning" }
      : { label: t("whatsapp.healthHealthy"), tone: "connected" };
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
          aria-label={t("ui.workspaceSettings")}
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
                    <h2>{t("mcp.title")}</h2>
                    <p>{t("mcp.description")}</p>
                  </div>
                </div>
                <div className="settings-form-grid">
                  <label>
                    {t("mcp.pluginName")}
                    <input
                      value={mcpName}
                      onChange={(event) => setMcpName(event.target.value)}
                      placeholder="Zelo workspace"
                    />
                  </label>
                  <label>
                    {t("mcp.purpose")}
                    <input
                      value={mcpDescription}
                      onChange={(event) =>
                        setMcpDescription(event.target.value)
                      }
                      placeholder="Find customers and account status"
                    />
                  </label>
                  <label>
                    {t("mcp.serverUrl")}
                    <input
                      value={mcpUrl}
                      onChange={(event) => setMcpUrl(event.target.value)}
                      placeholder="https://mcp.example.com"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    {t("mcp.authentication")}
                    <Select
                      value={mcpAuthMode}
                      onChange={(value) =>
                        setMcpAuthMode(value as McpConnection["authMode"])
                      }
                      options={[
                        { value: "none", label: t("mcp.none") },
                        { value: "headers", label: t("mcp.secretHeaders") },
                        { value: "oauth", label: t("mcp.oauth") },
                      ]}
                    />
                  </label>
                  {mcpAuthMode === "headers" && (
                    <label className="settings-form-wide">
                      {t("mcp.secretHeadersStored")}
                      <textarea
                        value={mcpHeaders}
                        onChange={(event) => setMcpHeaders(event.target.value)}
                        rows={3}
                        placeholder={t("mcp.headersPlaceholder")}
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
                  <Plus size={14} /> {t("mcp.addPlugin")}
                </button>
                {settingsLoading ? (
                  <LoadingState label={t("mcp.loading")} />
                ) : !mcpConnections.length ? (
                  <EmptyState
                    title={t("mcp.empty")}
                    description={t("mcp.emptyDescription")}
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
                                {t("mcp.status", {
                                  status: mcpStatusLabel(connection.status),
                                  count: connection.tools.length,
                                })}
                              </small>
                              {connection.lastError && (
                                <small role="alert">
                                  {t("errors.providerReported", {
                                    detail: connection.lastError,
                                  })}
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
                                        localizedError(
                                          reason,
                                          t("errors.oauthStart"),
                                        ),
                                      ),
                                    )
                                }
                              >
                                {t("mcp.authorizeOauth")}
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
                                    ? t("mcp.read")
                                    : t("mcp.writeConfirm")}
                                </label>
                              ))}
                              <label>
                                {t("mcp.writeAccess")}
                                <Select
                                  value={
                                    connection.writeModes.length === 2
                                      ? "both"
                                      : (connection.writeModes[0] ?? "none")
                                  }
                                  disabled={mcpAction === connection.id}
                                  options={[
                                    { value: "none", label: t("mcp.none") },
                                    {
                                      value: "draft",
                                      label: t("mcp.copilotDraft"),
                                    },
                                    {
                                      value: "safe_auto",
                                      label: t("mcp.autoReply"),
                                    },
                                    {
                                      value: "both",
                                      label: t("mcp.copilotAutoReply"),
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
                              <RefreshCw size={14} /> {t("mcp.test")}
                            </button>
                            <button
                              className="button button-danger"
                              type="button"
                              disabled={mcpAction === connection.id}
                              onClick={() => void disconnectMcp(connection)}
                            >
                              <Trash2 size={14} /> {t("mcp.disconnect")}
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
                    <h2>{t("whatsapp.title")}</h2>
                    <p>{t("whatsapp.description")}</p>
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
                      {t("ui.retry")}
                    </button>
                  </div>
                )}
                {selected &&
                  ["qr-code", "connecting"].includes(selected.state) && (
                    <div className="inline-empty" role="status">
                      <RefreshCw size={16} />
                      <span>{t("whatsapp.checking")}</span>
                    </div>
                  )}
                {!loading && !instances.length && (
                  <EmptyState
                    title={t("whatsapp.noInstances")}
                    description={t("whatsapp.noInstancesDescription")}
                  />
                )}
                {selected && (
                  <div className="connection-card">
                    <div className="connection-card-main">
                      <div className="whatsapp-symbol">◔</div>
                      <div>
                        <strong>{selected.instanceName}</strong>
                        <span>
                          {selected.phoneNumber ??
                            t("whatsapp.phoneNotReported")}{" "}
                          ·{t("whatsapp.provider")}
                        </span>
                        <small>
                          {t("whatsapp.providerState", {
                            state: providerStateLabel(selected.state),
                          })}{" "}
                          ·{" "}
                          {selected.lastEventAt
                            ? t("whatsapp.lastEvent", {
                                date: formatDate(selected.lastEventAt),
                              })
                            : t("whatsapp.noWebhook")}
                        </small>
                        {selected.historySyncComplete === false && (
                          <small className="history-sync-status">
                            {t("whatsapp.syncingHistory", {
                              progress: selected.historySyncProgress ?? 0,
                            })}
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
                        <RefreshCw size={14} /> {t("ui.refresh")}
                      </button>
                      {selected.state === "open" ? (
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={channelAction}
                          onClick={() => void disconnect()}
                        >
                          {t("whatsapp.disconnect")}
                        </button>
                      ) : (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={channelAction}
                          onClick={() => void connect()}
                        >
                          {t("whatsapp.connect")}
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
                        alt={t("whatsapp.qrAlt")}
                      />
                      <div>
                        <strong>{t("whatsapp.scanQr")}</strong>
                        <p>{t("whatsapp.scanDescription")}</p>
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
                        <strong>{t("whatsapp.pairNumber")}</strong>
                        <p>{t("whatsapp.generateDescription")}</p>
                      </div>
                    </div>
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={channelAction}
                      onClick={() => void loadQr()}
                    >
                      {t("whatsapp.generateQr")} <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </section>
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <h2>{t("whatsapp.pairNewNumber")}</h2>
                    <p>{t("whatsapp.pairNewDescription")}</p>
                  </div>
                </div>
                <div className="settings-form-grid">
                  <label>
                    {t("whatsapp.instanceName")}
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
                  {t("whatsapp.createInstance")}
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
                    <h2>{t("google.title")}</h2>
                    <p>{t("google.description")}</p>
                  </div>
                  <button
                    className="button button-ghost button-small google-connect-button"
                    type="button"
                    disabled={googleAction === "connect" || !workspaceId}
                    onClick={() => void connectGoogle()}
                  >
                    <Plus size={13} /> {t("google.connect")}
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
                      {t("ui.retry")}
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label={t("google.loading")} />
                ) : !googleConnections.length ? (
                  <EmptyState
                    title={t("google.empty")}
                    description={t("google.emptyDescription")}
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
                                  t("google.account")}
                              </strong>
                              <span>
                                {connection.accountEmail ??
                                  t("google.emailNotReported")}
                              </span>
                              <small>
                                {googleStatusLabel(connection.status)}{" "}
                                {t("google.calendarCount", {
                                  count: connection.calendars.length,
                                })}
                              </small>
                              {connection.lastError && (
                                <small role="alert">
                                  {t("errors.providerReported", {
                                    detail: connection.lastError,
                                  })}
                                </small>
                              )}
                            </div>
                          </div>
                          {connection.calendars.length > 0 && (
                            <fieldset className="connection-calendar-list">
                              <legend>{t("google.availableCalendars")}</legend>
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
                                    {calendar.primary
                                      ? t("google.primarySuffix")
                                      : ""}
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
                              <Trash2 size={13} /> {t("google.disconnect")}
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
                    <h2>{t("ai.title")}</h2>
                    <p>{t("ai.description")}</p>
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
                      {t("ui.retry")}
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label={t("ai.loading")} />
                ) : !settingsError && aiPolicy ? (
                  <>
                    <div className="policy-row">
                      <div>
                        <strong>{t("ai.applyMode")}</strong>
                        <p>
                          {t("ai.modeSummary", {
                            total: aiPolicy.totalConversations,
                            off: aiPolicy.counts.off,
                            drafts: aiPolicy.counts.draft,
                            autoReply: aiPolicy.counts.safe_auto,
                          })}
                        </p>
                      </div>
                      <Select
                        className="settings-inline-select"
                        ariaLabel={t("ai.modeForConversations")}
                        value={aiMode}
                        options={[
                          { value: "draft", label: t("ai.copilot") },
                          { value: "safe_auto", label: t("ai.autoReply") },
                          { value: "off", label: t("ai.manual") },
                        ]}
                        disabled={aiSaving}
                        onChange={(value) => setAiMode(value as AiMode)}
                      />
                    </div>
                    <div className="settings-note">
                      <Sparkles size={14} />
                      <span>{t("ai.modeNote")}</span>
                    </div>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={aiSaving || aiMode === aiPolicy.dominantMode}
                      onClick={() => void saveAiPolicy()}
                    >
                      <Save size={14} />{" "}
                      {aiSaving
                        ? t("ui.saving")
                        : t("ai.saveConversationPolicy")}
                    </button>
                    <div className="settings-section-header settings-subsection-header">
                      <div>
                        <h3>{t("ai.triageTitle")}</h3>
                        <p>{t("ai.triageDescription")}</p>
                      </div>
                    </div>
                    <div className="automation-route-grid">
                      {triageIntentValues.map((intent) => (
                        <label key={intent}>
                          {triageIntentLabel(intent)}
                          <Select
                            ariaLabel={t("ai.routeFor", {
                              intent: triageIntentLabel(intent),
                            })}
                            value={aiPolicy.routes[intent]}
                            options={aiTriageRouteValues.map((route) => ({
                              value: route,
                              label: triageRouteLabel(route),
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
                        {t("ai.fallback")}
                        <Select
                          ariaLabel={t("ai.fallbackRoute")}
                          value={aiPolicy.fallbackRoute}
                          options={aiTriageRouteValues.map((route) => ({
                            value: route,
                            label: triageRouteLabel(route),
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
                        {t("ai.mcpFailurePolicy")}
                        <Select
                          ariaLabel={t("ai.mcpFailurePolicy")}
                          value={aiPolicy.mcpFailurePolicy}
                          options={[
                            { value: "review", label: t("ai.sendToHuman") },
                            {
                              value: "generic_reply",
                              label: t("ai.genericKnowledgeReply"),
                            },
                            {
                              value: "retry_then_review",
                              label: t("ai.retryThenReview"),
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
                        {t("ai.enableSafeAuto")}
                      </label>
                      <label className="confidence-control">
                        {t("ai.minimumConfidence")}
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
                        {t("ai.requireKnowledge")}
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
                        {t("ai.notifyEscalation")}
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
                        {t("ai.notifyBug")}
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
                        {t("ai.startCodexForBugs")}
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
                        {t("ai.allowDeploy")}
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
                        {t("ai.allowAutoReplies")}
                      </label>
                    </div>
                    <div className="safe-auto-intents">
                      <strong>{t("ai.safeAutoIntents")}</strong>
                      <p>{t("ai.safeAutoIntentsDescription")}</p>
                      <div className="settings-form-grid automation-toggles">
                        {triageIntentValues.map((intent) => (
                          <label key={intent}>
                            <input
                              type="checkbox"
                              checked={aiPolicy.safeAutoIntents.includes(
                                intent,
                              )}
                              disabled={aiPolicySaving}
                              aria-label={t("ai.safeAutoIntent", {
                                intent: triageIntentLabel(intent),
                              })}
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
                            {triageIntentLabel(intent)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="settings-section-header settings-subsection-header">
                      <div>
                        <h3>{t("ai.autonomyTitle")}</h3>
                        <p>{t("ai.autonomyDescription")}</p>
                      </div>
                    </div>
                    <div className="settings-form-grid automation-toggles">
                      <div>
                        <strong>{t("ai.allowedChannels")}</strong>
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
                            {aiPolicyChannelLabel(channel)}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>{t("ai.allowedIntegrations")}</strong>
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
                            {aiPolicyIntegrationLabel(integration)}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>{t("ai.allowedActions")}</strong>
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
                            {aiPolicyActionLabel(action)}
                          </label>
                        ))}
                      </div>
                      <div>
                        <strong>{t("ai.humanApprovalRequired")}</strong>
                        {aiPolicy.humanApprovalActions.map((action) => (
                          <label key={action}>
                            <input type="checkbox" checked disabled readOnly />
                            {aiPolicyActionLabel(action)}
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
                      <Save size={14} /> {t("ai.saveTriageRules")}
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
                    <h2>{t("flow.title")}</h2>
                    <p>{t("flow.description")}</p>
                  </div>
                  <span className="section-count">
                    {t("flow.stepsCount", { count: flow?.nodes.length ?? 0 })}
                  </span>
                </div>
                {!workspaceId || !selected?.channelId ? (
                  <div className="inline-empty">
                    <MessageCircle size={16} />
                    <span>{t("flow.connectFirst")}</span>
                  </div>
                ) : settingsLoading || !flow ? (
                  <LoadingState label={t("flow.loading")} />
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
                          <strong>{t("flow.enable")}</strong>
                          <small>{t("flow.enableDescription")}</small>
                        </span>
                      </label>
                      <label>
                        {t("flow.startWhen")}
                        <Select
                          ariaLabel={t("flow.trigger")}
                          value={flow.trigger.type}
                          options={[
                            {
                              value: "first_message",
                              label: t("flow.firstMessage"),
                            },
                            {
                              value: "keywords",
                              label: t("flow.keywordDetected"),
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
                        {t("flow.keywords")}
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
                          placeholder={t("flow.keywordsPlaceholder")}
                        />
                        <small>{t("flow.keywordsHelp")}</small>
                      </label>
                    )}
                    <div className="flow-builder">
                      <aside
                        className="flow-node-list"
                        aria-label={t("flow.steps")}
                      >
                        <div className="flow-node-list-header">
                          <strong>{t("flow.steps")}</strong>
                          <button
                            className="icon-button subtle"
                            type="button"
                            aria-label={t("flow.addStep")}
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
                                ? t("flow.optionsCount", {
                                    count: node.options.length,
                                  })
                                : node.type === "handoff"
                                  ? t("flow.humanHandoff")
                                  : t("flow.message")}
                            </small>
                          </button>
                        ))}
                      </aside>
                      {selectedFlowNode && (
                        <div className="flow-node-editor">
                          <div className="flow-node-editor-header">
                            <div>
                              <span className="eyebrow">
                                {t("flow.selectedStep")}
                              </span>
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
                                <Trash2 size={13} /> {t("flow.removeStep")}
                              </button>
                            )}
                          </div>
                          <div className="settings-form-grid flow-node-fields">
                            <label>
                              {t("flow.stepName")}
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
                              {t("flow.stepType")}
                              <Select
                                ariaLabel={t("flow.stepType")}
                                value={selectedFlowNode.type}
                                options={[
                                  { value: "menu", label: t("flow.menu") },
                                  {
                                    value: "message",
                                    label: t("flow.sendMessage"),
                                  },
                                  {
                                    value: "handoff",
                                    label: t("flow.handOff"),
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
                            {t("flow.message")}
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
                              placeholder={t("flow.messagePlaceholder")}
                            />
                          </label>
                          {selectedFlowNode.type === "menu" && (
                            <div className="flow-options-editor">
                              <div className="flow-options-header">
                                <div>
                                  <strong>{t("flow.choices")}</strong>
                                  <small>{t("flow.choicesHelp")}</small>
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
                                                  label: t("flow.newChoice"),
                                                },
                                              ],
                                            }
                                          : node,
                                      ),
                                    }))
                                  }
                                >
                                  <Plus size={14} /> {t("flow.addChoice")}
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
                                        label: t("flow.endOrHuman"),
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
                                    aria-label={t("flow.removeChoice", {
                                      label: option.label,
                                    })}
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
                      {flowSaving ? t("ui.saving") : t("flow.save")}
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
                    <h2>{t("repositories.title")}</h2>
                    <p>{t("repositories.description")}</p>
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
                    <span>{t("repositories.empty")}</span>
                  </div>
                )}
                <div className="settings-form-grid">
                  <label>
                    {t("repositories.name")}
                    <input
                      value={repositoryName}
                      onChange={(event) =>
                        setRepositoryName(event.target.value)
                      }
                      placeholder="Support app"
                    />
                  </label>
                  <label>
                    {t("repositories.localPath")}
                    <input
                      value={repositoryPath}
                      onChange={(event) =>
                        setRepositoryPath(event.target.value)
                      }
                      placeholder="C:\workspace\support-app"
                    />
                  </label>
                  <label>
                    {t("repositories.defaultBranch")}
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
                  <Plus size={14} /> {t("repositories.add")}
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
                    <h2>{t("audit.title")}</h2>
                    <p>{t("audit.description")}</p>
                  </div>
                  <span className="section-count">
                    {t("audit.eventsCount", { count: auditLog.length })}
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
                      {t("ui.retry")}
                    </button>
                  </div>
                )}
                {settingsLoading ? (
                  <LoadingState label={t("audit.loading")} />
                ) : !settingsError && auditLog.length === 0 ? (
                  <EmptyState
                    title={t("audit.empty")}
                    description={t("audit.emptyDescription")}
                  />
                ) : (
                  !settingsError && (
                    <div
                      className="audit-list"
                      aria-label={t("audit.liveEvents")}
                    >
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
                                : t("audit.system")}
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
