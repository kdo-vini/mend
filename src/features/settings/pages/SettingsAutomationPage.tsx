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
  type AiPolicyChannel,
  type AiPolicyAction,
  type AiPolicyIntegration,
  type AiTriageRoute,
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
        reason instanceof Error ? reason.message : t("v2.ai.unavailable"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
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
        t("v2.ai.saved", {
          count: result.updatedCount,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("v2.ai.saveError"));
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
        <LoadingState label={t("v2.ai.loading")} />
      ) : error ? (
        <SettingsError message={error} onRetry={() => void load()} />
      ) : !policy ? (
        <EmptyState
          title={t("v2.ai.unavailable")}
          description={t("v2.workspaceRequired.description")}
        />
      ) : (
        <>
          <SettingsSection
            title={t("v2.ai.conversationMode")}
            description={t("v2.ai.conversationModeDescription")}
          >
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.ai.mode")}
                <Select
                  value={mode}
                  onChange={(value) => setMode(value as AiMode)}
                  options={[
                    { value: "off", label: t("v2.ai.manual") },
                    { value: "draft", label: t("v2.ai.copilot") },
                    { value: "safe_auto", label: t("v2.ai.safeAutoReply") },
                  ]}
                />
              </label>
            </div>
            <p className="settings-field-help">
              {t("v2.ai.conversationSummary", {
                total: policy.totalConversations,
                off: policy.counts.off,
                drafts: policy.counts.draft,
                autoReply: policy.counts.safe_auto,
              })}
            </p>
          </SettingsSection>
          <SettingsSection
            title={t("v2.ai.triageTitle")}
            description={t("v2.ai.triageDescription")}
          >
            <div className="settings-v2-policy-grid">
              {triageIntentValues.map((intent) => (
                <label key={intent}>
                  {t(`ai.intents.${intent}`)}
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
                      label: t(`ai.routes.${value}`),
                    }))}
                  />
                </label>
              ))}
            </div>
          </SettingsSection>
          <SettingsSection
            title={t("v2.ai.autonomyTitle")}
            description={t("v2.ai.autonomyDescription")}
          >
            <div className="settings-v2-check-grid">
              <fieldset>
                <legend>{t("v2.ai.allowedChannels")}</legend>
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
                    {t(`ai.channels.${value}`)}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t("v2.ai.allowedIntegrations")}</legend>
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
                    {t(`ai.integrations.${value}`)}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t("v2.ai.allowedActions")}</legend>
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
                    {t(`ai.actions.${value}`)}
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
                {t("v2.ai.requireKnowledge")}
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
                {t("v2.ai.notifyEscalation")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={policy.notifyOnBug}
                  onChange={(event) =>
                    setPolicy({ ...policy, notifyOnBug: event.target.checked })
                  }
                />
                {t("v2.ai.notifyBug")}
              </label>
            </div>
          </SettingsSection>
          <div className="settings-v2-save-bar">
            <span>{t("v2.ai.saveBar")}</span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void savePolicy()}
              disabled={saving}
            >
              <Save size={14} /> {saving ? t("v2.ai.saving") : t("v2.ai.save")}
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
        reason instanceof Error ? reason.message : t("v2.flow.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
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
      setError(t("v2.flow.connectFirst"));
      return;
    }
    const parsed = supportFlowSchema.safeParse(flow);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("v2.flow.error"));
      return;
    }
    setSaving(true);
    try {
      await saveLiveChannelFlow({
        workspaceId,
        channelId: channel.channelId,
        flow,
      });
      onToast(t("v2.flow.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("v2.flow.error"));
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
        <LoadingState label={t("v2.flow.loading")} />
      ) : error && !flow ? (
        <SettingsError message={error} onRetry={() => void load()} />
      ) : !flow ? (
        <EmptyState
          title={t("v2.flow.loadError")}
          description={t("v2.flow.connectFirst")}
        />
      ) : (
        <>
          {error && (
            <SettingsError message={error} onRetry={() => void load()} />
          )}
          {!channels.length && (
            <EmptyState
              title={t("v2.flow.connectFirst")}
              description={t("v2.flow.noChannelDescription")}
              action={
                <Link
                  className="button button-secondary button-small"
                  to="/settings/channels/whatsapp"
                >
                  {t("v2.flow.openWhatsapp")}
                </Link>
              }
            />
          )}
          <SettingsSection
            title={t("v2.flow.settingsTitle")}
            description={t("v2.flow.settingsDescription")}
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
                {t("v2.flow.enable")}
              </label>
              <label>
                {t("v2.flow.startWhen")}
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
                    { value: "first_message", label: t("v2.flow.newChat") },
                    { value: "keywords", label: t("v2.flow.keyword") },
                  ]}
                />
              </label>
              {flow.trigger.type === "keywords" && (
                <label>
                  {t("v2.flow.keywords")}
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
                    placeholder={t("v2.flow.keywordsPlaceholder")}
                  />
                </label>
              )}
            </div>
          </SettingsSection>
          <SettingsSection
            title={t("v2.flow.stepsTitle")}
            description={t("v2.flow.stepsDescription")}
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
                      title: t("v2.flow.newStep"),
                      type: "message",
                      message: t("v2.flow.newStepMessage"),
                      options: [],
                    };
                    setFlow({ ...flow, nodes: [...flow.nodes, node] });
                    setSelectedId(id);
                  }}
                >
                  <Plus size={13} /> {t("v2.flow.addStep")}
                </button>
              </div>
              {selectedNode && (
                <div className="settings-v2-flow-form">
                  <div className="settings-v2-form-grid">
                    <label>
                      {t("v2.flow.stepName")}
                      <input
                        value={selectedNode.title}
                        onChange={(event) =>
                          updateNode({ title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("v2.flow.stepType")}
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
                          { value: "menu", label: t("v2.flow.menu") },
                          { value: "message", label: t("v2.flow.message") },
                          { value: "handoff", label: t("v2.flow.handoff") },
                        ]}
                      />
                    </label>
                    <label className="settings-form-wide">
                      {t("v2.flow.customerMessage")}
                      <textarea
                        rows={5}
                        value={selectedNode.message}
                        placeholder={t("v2.flow.messagePlaceholder")}
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
                      <Trash2 size={13} /> {t("v2.flow.removeStep")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </SettingsSection>
          <div className="settings-v2-save-bar">
            <span>{t("v2.flow.saveBar")}</span>
            <button
              className="button button-primary"
              type="button"
              disabled={saving || !channels.length}
              onClick={() => void save()}
            >
              <Save size={14} />{" "}
              {saving ? t("v2.flow.saving") : t("v2.flow.save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
