import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Save, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { AiMode } from "../../../types";
import {
  aiPolicyActionValues,
  aiPolicyChannelValues,
  aiPolicyIntegrationValues,
  aiTriageRouteValues,
  triageIntentValues,
  type AiPolicyAction,
  type AiPolicyChannel,
  type AiPolicyIntegration,
  type AiTriageRoute,
  type TriageIntent,
} from "../../../ai-policy";
import {
  defaultSupportFlow,
  supportFlowSchema,
  type SupportFlow,
  type SupportFlowNode,
} from "../../../shared/support-flow";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import {
  loadLiveChannelFlow,
  listLiveChannels,
  saveLiveChannelFlow,
  type WhatsAppInstance,
} from "../api";
import {
  loadLiveAiConversationPolicy,
  saveLiveConversationAiPolicy,
  saveLiveWorkspaceAiPolicy,
  type LiveWorkspaceAiPolicy,
} from "../api";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";
import type { SettingsWorkspacePageProps } from "./SettingsWorkspacePage";

const intentLabels: Record<TriageIntent, string> = {
  question: "Question / pricing",
  how_to: "How-to",
  status: "Status",
  bug: "Bug report",
  incident: "Incident",
  billing: "Billing",
  feature: "Feature request",
  social: "Greeting / thanks",
  other: "Other / unknown",
};

const routeLabels: Record<AiTriageRoute, string> = {
  knowledge_auto_reply: "Answer from published knowledge",
  safe_auto_reply: "Low-risk reply without knowledge",
  draft_for_review: "Draft for human review",
  human_escalation: "Escalate to a human",
  bug_triage: "Bug triage",
  no_action: "No action",
};

const actionLabels: Record<AiPolicyAction, string> = {
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

const integrationLabels: Record<AiPolicyIntegration, string> = {
  knowledge: "Published knowledge",
  google_calendar: "Google Calendar",
  agent: "Coding agent",
  mcp: "MCP plugins",
};

export function SettingsAutomationPage(props: SettingsWorkspacePageProps) {
  const { section } = useParams();
  return section === "flows" ? (
    <SettingsFlowsPage {...props} />
  ) : (
    <SettingsAiPage {...props} />
  );
}

function SettingsAiPage({ workspaceId, onToast }: SettingsWorkspacePageProps) {
  const { t } = useTranslation("settings");
  const [policy, setPolicy] = useState<LiveWorkspaceAiPolicy | null>(null);
  const [mode, setMode] = useState<AiMode>("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadLiveAiConversationPolicy(workspaceId);
      setPolicy(next);
      if (next.dominantMode !== "mixed") setMode(next.dominantMode);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "AI policy is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);

  const toggle = <T extends string>(values: T[], value: T) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];

  const savePolicy = async () => {
    if (!workspaceId || !policy) return;
    setSaving(true);
    try {
      await saveLiveWorkspaceAiPolicy(workspaceId, policy);
      const result = await saveLiveConversationAiPolicy(workspaceId, mode);
      onToast(
        `AI policy saved for ${result.updatedCount} live conversation${result.updatedCount === 1 ? "" : "s"}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "AI policy could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("ai.title")}
        description={t("ai.description")}
      />
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Loading AI policy…" />
      ) : error ? (
        <SettingsError message={error} onRetry={() => void load()} />
      ) : !policy ? (
        <EmptyState
          title="AI policy unavailable"
          description="Select a workspace before editing automation."
        />
      ) : (
        <>
          <SettingsSection
            title="Conversation mode"
            description="This mode applies to current live conversations. Workspace routes below remain the source of truth for new messages."
          >
            <div className="settings-v2-form-grid">
              <label>
                Mode
                <Select
                  value={mode}
                  onChange={(value) => setMode(value as AiMode)}
                  options={[
                    { value: "off", label: "Manual" },
                    { value: "draft", label: "Copilot / draft" },
                    { value: "safe_auto", label: "Safe auto-reply" },
                  ]}
                />
              </label>
            </div>
            <p className="settings-field-help">
              {policy.totalConversations} live conversations ·{" "}
              {policy.counts.off} manual · {policy.counts.draft} drafts ·{" "}
              {policy.counts.safe_auto} auto-replies.
            </p>
          </SettingsSection>
          <SettingsSection
            title="Triage routes"
            description="A published-knowledge route falls back to human review when relevant evidence is missing."
          >
            <div className="settings-v2-policy-grid">
              {triageIntentValues.map((intent) => (
                <label key={intent}>
                  {intentLabels[intent]}
                  <Select
                    value={policy.routes[intent]}
                    onChange={(value) =>
                      setPolicy({
                        ...policy,
                        routes: {
                          ...policy.routes,
                          [intent]: value as AiTriageRoute,
                        },
                      })
                    }
                    options={aiTriageRouteValues.map((value) => ({
                      value,
                      label: routeLabels[value],
                    }))}
                  />
                </label>
              ))}
            </div>
          </SettingsSection>
          <SettingsSection
            title="Autonomy boundaries"
            description="Sensitive actions remain behind human approval even when they are enabled for the workspace."
          >
            <div className="settings-v2-check-grid">
              <fieldset>
                <legend>Allowed channels</legend>
                {aiPolicyChannelValues.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={policy.allowedChannels.includes(value)}
                      onChange={() =>
                        setPolicy({
                          ...policy,
                          allowedChannels: toggle(
                            policy.allowedChannels,
                            value,
                          ) as AiPolicyChannel[],
                        })
                      }
                    />
                    {value === "whatsapp" ? "WhatsApp" : "Web conversations"}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Allowed integrations</legend>
                {aiPolicyIntegrationValues.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={policy.allowedIntegrations.includes(value)}
                      onChange={() =>
                        setPolicy({
                          ...policy,
                          allowedIntegrations: toggle(
                            policy.allowedIntegrations,
                            value,
                          ) as AiPolicyIntegration[],
                        })
                      }
                    />
                    {integrationLabels[value]}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Allowed actions</legend>
                {aiPolicyActionValues.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={policy.allowedActions.includes(value)}
                      onChange={() =>
                        setPolicy({
                          ...policy,
                          allowedActions: toggle(
                            policy.allowedActions,
                            value,
                          ) as AiPolicyAction[],
                        })
                      }
                    />
                    {actionLabels[value]}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="settings-v2-toggle-list">
              <label>
                <input
                  type="checkbox"
                  checked={policy.requirePublishedKnowledge}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      requirePublishedKnowledge: event.target.checked,
                    })
                  }
                />
                Require published knowledge for knowledge replies
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={policy.notifyOnHumanEscalation}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      notifyOnHumanEscalation: event.target.checked,
                    })
                  }
                />
                Notify the team when a case escalates
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={policy.notifyOnBug}
                  onChange={(event) =>
                    setPolicy({ ...policy, notifyOnBug: event.target.checked })
                  }
                />
                Notify the team when a bug is reported
              </label>
            </div>
          </SettingsSection>
          <div className="settings-v2-save-bar">
            <span>Changes apply to new automation decisions after saving.</span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void savePolicy()}
              disabled={saving}
            >
              <Save size={14} /> {saving ? "Saving…" : "Save AI policy"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsFlowsPage({
  workspaceId,
  onToast,
}: SettingsWorkspacePageProps) {
  const { t } = useTranslation("settings");
  const [channels, setChannels] = useState<WhatsAppInstance[]>([]);
  const [flow, setFlow] = useState<SupportFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => flow?.nodes.find((node) => node.id === selectedId) ?? flow?.nodes[0],
    [flow, selectedId],
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listLiveChannels(workspaceId);
      setChannels(rows);
      const channel = rows.find((item) => item.state === "open") ?? rows[0];
      const next = channel?.channelId
        ? await loadLiveChannelFlow({
            workspaceId,
            channelId: channel.channelId,
          })
        : null;
      setFlow(next ?? defaultSupportFlow());
      setSelectedId((next ?? defaultSupportFlow()).rootNodeId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Support flow is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);

  const updateNode = (update: Partial<SupportFlowNode>) =>
    setFlow((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === selectedNode?.id ? { ...node, ...update } : node,
            ),
          }
        : current,
    );
  const save = async () => {
    if (!workspaceId || !flow) return;
    const channel =
      channels.find((item) => item.state === "open") ?? channels[0];
    if (!channel?.channelId) {
      setError("Connect a WhatsApp number before saving a flow.");
      return;
    }
    const parsed = supportFlowSchema.safeParse(flow);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "The flow is invalid.");
      return;
    }
    setSaving(true);
    try {
      await saveLiveChannelFlow({
        workspaceId,
        channelId: channel.channelId,
        flow,
      });
      onToast("Support flow saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Support flow could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("flow.title")}
        description={t("flow.description")}
      />
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Loading support flow…" />
      ) : error && !flow ? (
        <SettingsError message={error} onRetry={() => void load()} />
      ) : !flow ? (
        <EmptyState
          title="No flow loaded"
          description="Connect a WhatsApp number before configuring a flow."
        />
      ) : (
        <>
          {error && (
            <SettingsError message={error} onRetry={() => void load()} />
          )}
          {!channels.length && (
            <EmptyState
              title="Connect WhatsApp first"
              description="A flow belongs to a real channel and cannot be saved without one."
              action={
                <Link
                  className="button button-secondary button-small"
                  to="/settings/channels/whatsapp"
                >
                  Open WhatsApp settings
                </Link>
              }
            />
          )}
          <SettingsSection
            title="Flow settings"
            description="Keep the first interaction short and make human handoff explicit."
          >
            <div className="settings-v2-form-grid">
              <label className="settings-v2-checkbox-field">
                <input
                  type="checkbox"
                  checked={flow.enabled}
                  onChange={(event) =>
                    setFlow({ ...flow, enabled: event.target.checked })
                  }
                />
                Enable this flow
              </label>
              <label>
                Start when
                <Select
                  value={flow.trigger.type}
                  onChange={(value) =>
                    setFlow({
                      ...flow,
                      trigger: {
                        ...flow.trigger,
                        type: value as "first_message" | "keywords",
                      },
                    })
                  }
                  options={[
                    { value: "first_message", label: "A new chat starts" },
                    { value: "keywords", label: "A keyword is detected" },
                  ]}
                />
              </label>
              {flow.trigger.type === "keywords" && (
                <label>
                  Keywords
                  <input
                    value={flow.trigger.keywords.join(", ")}
                    onChange={(event) =>
                      setFlow({
                        ...flow,
                        trigger: {
                          ...flow.trigger,
                          keywords: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="price, order, help"
                  />
                </label>
              )}
            </div>
          </SettingsSection>
          <SettingsSection
            title="Flow steps"
            description="Select a step to edit its customer-facing message."
          >
            <div className="settings-v2-flow-editor">
              <div className="settings-v2-flow-list">
                {flow.nodes.map((node) => (
                  <button
                    className={`settings-v2-flow-item ${selectedNode?.id === node.id ? "selected" : ""}`}
                    type="button"
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                  >
                    <strong>{node.title}</strong>
                    <span>{node.type}</span>
                  </button>
                ))}
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={() => {
                    const id = `step-${Date.now()}`;
                    const node: SupportFlowNode = {
                      id,
                      title: "New step",
                      type: "message",
                      message: "Write the message this step should send.",
                      options: [],
                    };
                    setFlow({ ...flow, nodes: [...flow.nodes, node] });
                    setSelectedId(id);
                  }}
                >
                  <Plus size={13} /> Add step
                </button>
              </div>
              {selectedNode && (
                <div className="settings-v2-flow-form">
                  <div className="settings-v2-form-grid">
                    <label>
                      Step name
                      <input
                        value={selectedNode.title}
                        onChange={(event) =>
                          updateNode({ title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Step type
                      <Select
                        value={selectedNode.type}
                        onChange={(value) =>
                          updateNode({
                            type: value as SupportFlowNode["type"],
                            options:
                              value === "menu" ? selectedNode.options : [],
                          })
                        }
                        options={[
                          { value: "menu", label: "Menu with options" },
                          { value: "message", label: "Send a message" },
                          { value: "handoff", label: "Hand off to a person" },
                        ]}
                      />
                    </label>
                    <label className="settings-form-wide">
                      Customer message
                      <textarea
                        rows={5}
                        value={selectedNode.message}
                        onChange={(event) =>
                          updateNode({ message: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {flow.nodes.length > 1 && (
                    <button
                      className="button button-danger button-small"
                      type="button"
                      onClick={() => {
                        const nodes = flow.nodes.filter(
                          (node) => node.id !== selectedNode.id,
                        );
                        setFlow({
                          ...flow,
                          nodes,
                          rootNodeId:
                            flow.rootNodeId === selectedNode.id
                              ? nodes[0].id
                              : flow.rootNodeId,
                        });
                        setSelectedId(nodes[0]?.id);
                      }}
                    >
                      <Trash2 size={13} /> Remove step
                    </button>
                  )}
                </div>
              )}
            </div>
          </SettingsSection>
          <div className="settings-v2-save-bar">
            <span>Flows run before AI triage on new chats.</span>
            <button
              className="button button-primary"
              type="button"
              disabled={saving || !channels.length}
              onClick={() => void save()}
            >
              <Save size={14} /> {saving ? "Saving…" : "Save support flow"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
