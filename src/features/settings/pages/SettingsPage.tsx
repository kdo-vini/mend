import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronRight,
  GitBranch,
  Info,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { AiMode } from "../../../types";
import type { WhatsAppInstance } from "../api";
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
  listLiveChannels,
  listLiveRepositories,
  listWhatsAppInstances,
  refreshLiveChannel,
} from "../api";
import {
  listLiveAuditLog,
  listLiveWorkspaceMembers,
  loadLiveAiConversationPolicy,
  saveLiveConversationAiPolicy,
  saveLiveWorkspaceAiPolicy,
  type AuditLogRecord,
  type LiveWorkspaceAiPolicy,
  type WorkspaceMemberRecord,
} from "../api";
import {
  aiTriageRouteValues,
  triageIntentValues,
  type AiTriageRoute,
  type TriageIntent,
} from "../../../ai-policy";
import { supabase } from "../api";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { Select } from "../../../shared/ui/Select";

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

export function SettingsPage({
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
