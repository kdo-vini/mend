import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { LoadingState } from "../../../shared/ui/ResourceState";
import {
  getLiveGitHubConnection,
  listLiveAgentConnections,
  listLiveAgentRoutingPolicies,
  listLiveChannels,
  listLiveRepositories,
  listLiveWorkspaceMembers,
  type LiveAgentConnection,
  type LiveRepository,
  type WhatsAppInstance,
} from "../api";
import { legacySettingsPath } from "../settings-navigation";
import { SettingsLayout } from "../components/SettingsLayout";
import { SettingsOverviewRow } from "../components/SettingsOverviewRow";
import {
  SettingsPageHeader,
  SettingsSection,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";
import { SettingsWhatsAppPage } from "./SettingsWhatsAppPage";
import { SettingsTeamPage } from "./SettingsTeamPage";
import { SettingsAutomationPage } from "./SettingsAutomationPage";
import {
  SettingsIntegrationsPage,
  SettingsGithubPage,
  SettingsGooglePage,
  SettingsMcpPage,
} from "./SettingsIntegrationPages";
import {
  SettingsRepositoriesPage,
  SettingsCodingConnectionsPage,
  SettingsCodingRoutingPage,
} from "./SettingsEngineeringPages";
import { SettingsAuditPage } from "./SettingsAuditPage";
import { useTranslation } from "react-i18next";

export interface SettingsWorkspacePageProps {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onChannelChange: (channel: WhatsAppInstance | null) => void;
  onConfirm: Confirm;
}

export function SettingsWorkspacePage(props: SettingsWorkspacePageProps) {
  const location = useLocation();
  const legacyPath = legacySettingsPath(
    new URLSearchParams(location.search).get("tab"),
  );
  if (legacyPath) {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("tab");
    const query = nextSearch.toString();
    return <Navigate replace to={`${legacyPath}${query ? `?${query}` : ""}`} />;
  }

  return <SettingsWorkspaceRoutes {...props} />;
}

export function SettingsWorkspaceRoutes(props: SettingsWorkspacePageProps) {
  return (
    <Routes>
      <Route element={<SettingsLayout />}>
        <Route
          index
          element={<SettingsOverviewPage workspaceId={props.workspaceId} />}
        />
        <Route
          path="channels/whatsapp"
          element={<SettingsWhatsAppPage {...props} />}
        />
        <Route
          path="team"
          element={
            <SettingsTeamPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="automation/:section"
          element={<SettingsAutomationPage {...props} />}
        />
        <Route path="integrations" element={<SettingsIntegrationsPage />} />
        <Route
          path="integrations/github"
          element={
            <SettingsGithubPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="integrations/google"
          element={
            <SettingsGooglePage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="integrations/mcp"
          element={
            <SettingsMcpPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="engineering/repositories"
          element={
            <SettingsRepositoriesPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="engineering/coding/connections"
          element={
            <SettingsCodingConnectionsPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
              onConfirm={props.onConfirm}
            />
          }
        />
        <Route
          path="engineering/coding/routing"
          element={
            <SettingsCodingRoutingPage
              workspaceId={props.workspaceId}
              onToast={props.onToast}
            />
          }
        />
        <Route
          path="audit"
          element={<SettingsAuditPage workspaceId={props.workspaceId} />}
        />
        <Route path="*" element={<Navigate replace to="/settings" />} />
      </Route>
    </Routes>
  );
}

export function SettingsOverviewPage({
  workspaceId,
}: {
  workspaceId: string | null;
}) {
  const { t } = useTranslation("settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<WhatsAppInstance[]>([]);
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [connections, setConnections] = useState<LiveAgentConnection[]>([]);
  const [policyCount, setPolicyCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all([
        listLiveChannels(workspaceId),
        listLiveRepositories(workspaceId),
        getLiveGitHubConnection(workspaceId),
        listLiveAgentConnections(workspaceId),
        listLiveAgentRoutingPolicies({ workspaceId }),
        listLiveWorkspaceMembers(workspaceId),
      ]);
      setChannels(results[0]);
      setRepositories(results[1]);
      setGithubConnected(results[2].connected);
      setConnections(results[3]);
      setPolicyCount(results[4].length);
      setMemberCount(results[5].length);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("v2.overview.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);

  useEffect(() => void load(), [load]);

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.overview.title")}
        description={t("v2.overview.description")}
      />
      {loading ? (
        <LoadingState label={t("v2.overview.loading")} />
      ) : error ? (
        <div className="settings-v2-stack">
          <div className="settings-v2-error" role="alert">
            <span>{error}</span>
            <button
              className="text-button"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : !workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : (
        <>
          <SettingsSection
            title={t("v2.overview.readiness")}
            description={t("v2.overview.readinessDescription")}
          >
            <div className="settings-overview-list">
              <SettingsOverviewRow
                label={t("v2.overview.whatsappLabel")}
                description={t("v2.overview.whatsappDescription")}
                status={
                  channels.some((channel) => channel.state === "open")
                    ? t("v2.overview.connected")
                    : t("v2.overview.needsAttention")
                }
                tone={
                  channels.some((channel) => channel.state === "open")
                    ? "success"
                    : "warning"
                }
                to="/settings/channels/whatsapp"
              />
              <SettingsOverviewRow
                label={t("v2.overview.externalAccessLabel")}
                description={t("v2.overview.externalAccessDescription")}
                status={
                  githubConnected
                    ? `${t("v2.layout.items.github")} ${t("v2.overview.connected").toLowerCase()}`
                    : t("v2.overview.reviewConnections")
                }
                tone={githubConnected ? "success" : "warning"}
                to="/settings/integrations"
              />
              <SettingsOverviewRow
                label={t("v2.overview.codingLabel")}
                description={t("v2.overview.codingDescription")}
                status={
                  connections.length > 0 && policyCount > 0
                    ? t("v2.overview.configured")
                    : t("v2.overview.notReady")
                }
                tone={
                  connections.length > 0 && policyCount > 0
                    ? "success"
                    : "warning"
                }
                to="/settings/engineering/coding/connections"
              >
                <span className="settings-overview-meta">
                  {t("v2.overview.connectionCount", {
                    count: connections.length,
                  })}
                </span>
              </SettingsOverviewRow>
              <SettingsOverviewRow
                label={t("v2.overview.repositoriesLabel")}
                description={t("v2.overview.repositoriesDescription")}
                status={
                  repositories.length
                    ? `${repositories.length} ${t("v2.overview.configured").toLowerCase()}`
                    : t("v2.overview.addRepository")
                }
                tone={repositories.length ? "success" : "warning"}
                to="/settings/engineering/repositories"
              />
              <SettingsOverviewRow
                label={t("v2.overview.teamLabel")}
                description={t("v2.overview.teamDescription")}
                status={t("v2.overview.memberCount", { count: memberCount })}
                tone="muted"
                to="/settings/team"
              />
            </div>
          </SettingsSection>
          <SettingsSection
            title={t("v2.overview.nextActions")}
            description={t("v2.overview.nextActionsDescription")}
          >
            <div className="settings-v2-callout">
              <div>
                <strong>{t("v2.overview.nextActionsTitle")}</strong>
                <p>{t("v2.overview.nextActionsDescriptionText")}</p>
              </div>
              <div className="settings-v2-inline-actions">
                <Link
                  className="button button-secondary button-small"
                  to="/settings/automation/ai"
                >
                  {t("v2.overview.reviewAi")}
                </Link>
                <Link
                  className="button button-primary button-small"
                  to="/settings/engineering/coding/routing"
                >
                  {t("v2.overview.reviewCoding")}
                </Link>
              </div>
            </div>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
